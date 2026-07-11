/**
 * AI auto-betting — places HIP-4 outcome orders via the same HL agent as the perps bot.
 * Respects Win/Draw/Loss prefs, Yes/No markets, and user betting budget (spot USDC cap).
 */
import { createClient } from '@supabase/supabase-js';
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import { hlAgentApprovalService } from './hlAgentApprovals';
import { fetchHlSpotUsdcUsd } from './hlInfo';
import { getBettingFeeStatus } from './bettingFees';
import { fetchAnalyzedSportsNews } from './sportsNewsService';
import { queueBettingOpenNotification } from './tradeCloseEmail';
import {
  buildOutcomeOrderLeg,
  OUTCOME_MIN_NOTIONAL_USD,
  outcomeBalanceCoin,
  outcomeOrderCoin,
  type OutcomeSideIndex,
} from './outcomeOrders';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
const transport = new HttpTransport();

type AutoBettingUser = {
  wallet: string;
  userId: string;
  allowWin: boolean;
  allowDraw: boolean;
  allowLoss: boolean;
  /** Max spot USDC this agent may use. 0 = skip until user sets budget. */
  budgetUsd: number;
};

type LegKind = 'win' | 'draw' | 'loss' | 'yes_no' | 'other';

type Candidate = {
  outcomeId: number;
  side: OutcomeSideIndex;
  marketName: string;
  sideLabel: string;
  leanPct: number;
  reasoning: string;
  legKind: LegKind;
};

const lastBetAt = new Map<string, number>();
const COOLDOWN_MS = 15 * 60_000;

function createAgentClient(userAddress: string): ExchangeClient {
  const agent = deriveUserHlAgent(userAddress);
  return new ExchangeClient({ transport, wallet: agent });
}

function prefsAllow(user: AutoBettingUser, kind: LegKind): boolean {
  switch (kind) {
    case 'win':
      return user.allowWin;
    case 'draw':
      return user.allowDraw;
    case 'loss':
      return user.allowLoss;
    case 'yes_no':
      return user.allowWin || user.allowLoss;
    default:
      return user.allowWin || user.allowDraw || user.allowLoss;
  }
}

function formatLegKindLabel(kind: LegKind, sideLabel: string): string {
  if (kind === 'yes_no') return sideLabel.toLowerCase() === 'no' ? 'No' : 'Yes';
  if (kind === 'draw') return 'Draw';
  if (kind === 'loss') return 'Loss';
  if (kind === 'win') return 'Win';
  return sideLabel;
}

async function loadAutoBettingUsers(limit = 40): Promise<AutoBettingUser[]> {
  const { data, error } = await supabase
    .from('vault_settings')
    .select(
      'wallet_address, user_id, auto_betting_allow_win, auto_betting_allow_draw, auto_betting_allow_loss, auto_betting_budget_usd'
    )
    .eq('auto_betting_enabled', true)
    .limit(limit);

  if (error) {
    // Budget column may not exist yet — fall back without it (budget=0 → no bets).
    const legacy = await supabase
      .from('vault_settings')
      .select(
        'wallet_address, user_id, auto_betting_allow_win, auto_betting_allow_draw, auto_betting_allow_loss'
      )
      .eq('auto_betting_enabled', true)
      .limit(limit);
    if (legacy.error) {
      logger.warn('auto-betting users query failed', { error: legacy.error.message });
      return [];
    }
    return mapUsers(legacy.data ?? [], true);
  }

  return mapUsers(data ?? [], false);
}

function mapUsers(
  rows: Array<Record<string, unknown>>,
  forceZeroBudget: boolean
): AutoBettingUser[] {
  const out: AutoBettingUser[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const wallet = String(row.wallet_address ?? '')
      .trim()
      .toLowerCase();
    const userId = String(row.user_id ?? '');
    if (!wallet || !userId || seen.has(wallet)) continue;
    seen.add(wallet);
    const budget = forceZeroBudget ? 0 : Number(row.auto_betting_budget_usd) || 0;
    out.push({
      wallet,
      userId,
      allowWin: row.auto_betting_allow_win !== false,
      allowDraw: row.auto_betting_allow_draw !== false,
      allowLoss: row.auto_betting_allow_loss !== false,
      budgetUsd: budget > 0 ? budget : 0,
    });
  }
  return out;
}

async function openBettingStakeUsd(wallet: string): Promise<number> {
  const { data } = await supabase
    .from('hl_betting_positions')
    .select('entry_ntl')
    .eq('wallet_address', wallet);
  return (data ?? []).reduce((s, r) => s + (Number(r.entry_ntl) || 0), 0);
}

async function countOpenOutcomePositions(wallet: string): Promise<number> {
  const { count } = await supabase
    .from('hl_betting_positions')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_address', wallet);
  return count ?? 0;
}

async function fetchBookMid(outcomeId: number, side: OutcomeSideIndex): Promise<number> {
  const coin = outcomeOrderCoin(outcomeId, side);
  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'l2Book', coin }),
    });
    if (!res.ok) return 0;
    const book = (await res.json()) as {
      levels?: Array<Array<{ px?: string }>>;
    };
    const bids = book.levels?.[0] ?? [];
    const asks = book.levels?.[1] ?? [];
    const bestBid = Number(bids[0]?.px) || 0;
    const bestAsk = Number(asks[0]?.px) || 0;
    if (bestAsk > 0) return bestAsk;
    if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2;
    return bestBid > 0 ? bestBid : 0;
  } catch {
    return 0;
  }
}

async function buildCandidates(user: AutoBettingUser): Promise<Candidate[]> {
  const news = await fetchAnalyzedSportsNews(12);
  const minLean = config.hyperliquid.autoBettingMinLeanPct;
  const out: Candidate[] = [];

  for (const item of news) {
    const p = item.prognosis;
    if (!p?.outcomeId || p.prognosisPct < minLean) continue;

    const marketKind = (p.marketKind ?? 'other') as LegKind;
    let side: OutcomeSideIndex = (p.side === 1 ? 1 : 0) as OutcomeSideIndex;
    let legKind: LegKind = marketKind;

    if (marketKind === 'yes_no') {
      if (side === 0 && !user.allowWin) {
        if (!user.allowLoss) continue;
        side = 1;
      } else if (side === 1 && !user.allowLoss) {
        if (!user.allowWin) continue;
        side = 0;
      }
      legKind = 'yes_no';
    } else if (!prefsAllow(user, marketKind === 'other' ? 'win' : marketKind)) {
      continue;
    }

    out.push({
      outcomeId: p.outcomeId,
      side,
      marketName: p.eventName,
      sideLabel: p.sideLabel ?? (side === 0 ? 'Yes' : 'No'),
      leanPct: p.prognosisPct,
      reasoning: p.reasoning,
      legKind,
    });
  }

  out.sort((a, b) => b.leanPct - a.leanPct);
  return out;
}

async function recordAiOpen(opts: {
  userId: string;
  wallet: string;
  outcomeId: number;
  side: OutcomeSideIndex;
  marketName: string;
  sideLabel: string;
  legKind: LegKind;
  reason: string;
  size: number;
  entryPx: number;
  entryNtl: number;
}): Promise<string | null> {
  const now = new Date().toISOString();
  const balanceCoin = outcomeBalanceCoin(opts.outcomeId, opts.side);
  const row = {
    user_id: opts.userId,
    wallet_address: opts.wallet,
    outcome_id: opts.outcomeId,
    side: opts.side,
    side_label: opts.sideLabel,
    market_name: opts.marketName,
    category: 'sports',
    balance_coin: balanceCoin,
    size: opts.size,
    entry_px: opts.entryPx,
    entry_ntl: opts.entryNtl,
    mark_px: opts.entryPx,
    unrealized_pnl: 0,
    source: 'ai_agent',
    open_reason: opts.reason,
    leg_kind: opts.legKind,
    opened_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('hl_betting_positions')
    .upsert(row, { onConflict: 'user_id,wallet_address,balance_coin' })
    .select('id')
    .maybeSingle();

  if (error) {
    // Columns may be missing pre-migration — retry without reason fields.
    const { open_reason: _r, leg_kind: _k, ...base } = row;
    const retry = await supabase
      .from('hl_betting_positions')
      .upsert(base, { onConflict: 'user_id,wallet_address,balance_coin' })
      .select('id')
      .maybeSingle();
    if (retry.error) {
      logger.warn('AI open position upsert failed', { error: retry.error.message });
      return null;
    }
    return retry.data?.id ? String(retry.data.id) : null;
  }
  return data?.id ? String(data.id) : null;
}

async function placeBet(user: AutoBettingUser, candidate: Candidate): Promise<boolean> {
  if (user.budgetUsd < OUTCOME_MIN_NOTIONAL_USD) {
    logger.debug('auto-bet skip — no betting budget set', {
      wallet: user.wallet.slice(0, 10),
      budget: user.budgetUsd,
    });
    return false;
  }

  const spotUsd = await fetchHlSpotUsdcUsd(user.wallet);
  const openStake = await openBettingStakeUsd(user.wallet);
  const budgetLeft = Math.max(0, user.budgetUsd - openStake);
  const available = Math.min(spotUsd, budgetLeft);

  if (available < OUTCOME_MIN_NOTIONAL_USD) {
    logger.debug('auto-bet skip — budget/spot exhausted', {
      wallet: user.wallet.slice(0, 10),
      spotUsd: spotUsd.toFixed(2),
      budget: user.budgetUsd.toFixed(2),
      openStake: openStake.toFixed(2),
      available: available.toFixed(2),
    });
    return false;
  }

  const riskFrac = config.hyperliquid.autoBettingRiskFraction;
  const stakeUsd = Math.max(
    OUTCOME_MIN_NOTIONAL_USD,
    Math.min(available * riskFrac, available, available * 0.5)
  );

  const refPx = await fetchBookMid(candidate.outcomeId, candidate.side);
  if (refPx < 0.05 || refPx > 0.95) {
    logger.debug('auto-bet skip — bad price', {
      outcomeId: candidate.outcomeId,
      refPx,
    });
    return false;
  }

  const size = Math.max(1, Math.floor(stakeUsd / refPx));
  const notional = size * refPx;
  if (notional < OUTCOME_MIN_NOTIONAL_USD || notional > available + 0.01) return false;

  const leg = buildOutcomeOrderLeg({
    outcomeId: candidate.outcomeId,
    side: candidate.side,
    orderSide: 'buy',
    size,
    price: refPx,
    kind: 'market',
  });

  const client = createAgentClient(user.wallet);
  const result = await client.order({
    orders: [leg],
    grouping: 'na',
  });

  const statuses = (result as { response?: { data?: { statuses?: unknown[] } } })?.response
    ?.data?.statuses;
  const ok =
    Array.isArray(statuses) &&
    statuses.some((s) => s && typeof s === 'object' && ('filled' in s || 'resting' in s));

  if (!ok) {
    logger.warn('auto-bet order rejected', {
      wallet: user.wallet.slice(0, 10),
      outcomeId: candidate.outcomeId,
      result: JSON.stringify(result).slice(0, 240),
    });
    return false;
  }

  const pickLabel = formatLegKindLabel(candidate.legKind, candidate.sideLabel);
  const sideDisplay = `${candidate.sideLabel} · ${pickLabel}`;
  const reason = `${candidate.reasoning} · lean ${candidate.leanPct}%`;

  await recordAiOpen({
    userId: user.userId,
    wallet: user.wallet,
    outcomeId: candidate.outcomeId,
    side: candidate.side,
    marketName: candidate.marketName,
    sideLabel: sideDisplay,
    legKind: candidate.legKind,
    reason,
    size,
    entryPx: refPx,
    entryNtl: notional,
  });

  await queueBettingOpenNotification({
    userId: user.userId,
    wallet: user.wallet,
    marketName: candidate.marketName,
    sideLabel: sideDisplay,
    legKind: pickLabel,
    stakeUsd: notional,
    entryPx: refPx,
    size,
    reason,
  });

  lastBetAt.set(user.wallet, Date.now());
  logger.info('AI auto-bet placed', {
    wallet: user.wallet.slice(0, 10),
    market: candidate.marketName.slice(0, 48),
    pick: pickLabel,
    side: candidate.sideLabel,
    lean: candidate.leanPct,
    size,
    notional: notional.toFixed(2),
    reason: reason.slice(0, 160),
  });
  return true;
}

async function processUser(user: AutoBettingUser): Promise<'ok' | 'skip' | 'fail'> {
  try {
    const last = lastBetAt.get(user.wallet) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) return 'skip';

    if (user.budgetUsd < OUTCOME_MIN_NOTIONAL_USD) return 'skip';

    const agentAddr = deriveUserHlAgent(user.wallet).address;
    const approved = await hlAgentApprovalService.isApproved(user.wallet, agentAddr);
    if (!approved) return 'skip';

    const fees = await getBettingFeeStatus(user.wallet);
    if (fees.bettingBlocked) {
      logger.debug('auto-bet skip — fees due', { wallet: user.wallet.slice(0, 10) });
      return 'skip';
    }

    const openCount = await countOpenOutcomePositions(user.wallet);
    if (openCount >= config.hyperliquid.autoBettingMaxOpen) return 'skip';

    if (!user.allowWin && !user.allowDraw && !user.allowLoss) return 'skip';

    const candidates = await buildCandidates(user);
    if (candidates.length === 0) return 'skip';

    for (const c of candidates.slice(0, 3)) {
      const placed = await placeBet(user, c);
      if (placed) return 'ok';
    }
    return 'skip';
  } catch (err) {
    logger.warn('auto-bet user failed', {
      wallet: user.wallet.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return 'fail';
  }
}

let cycleRunning = false;

export async function runAutoBettingCycle(): Promise<void> {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
    const users = await loadAutoBettingUsers(40);
    if (users.length === 0) return;

    let ok = 0;
    let skip = 0;
    let fail = 0;
    for (const user of users) {
      const r = await processUser(user);
      if (r === 'ok') ok += 1;
      else if (r === 'fail') fail += 1;
      else skip += 1;
    }

    if (ok > 0 || fail > 0) {
      logger.info('Auto-betting cycle', { users: users.length, ok, skip, fail });
    }
  } finally {
    cycleRunning = false;
  }
}
