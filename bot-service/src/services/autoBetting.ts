/**
 * AI auto-betting — places HIP-4 outcome orders via the same HL agent as the perps bot.
 * Respects vault_settings.auto_betting_* prefs (win / draw / loss) and Yes/No markets.
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
import {
  buildOutcomeOrderLeg,
  OUTCOME_MIN_NOTIONAL_USD,
  outcomeBalanceCoin,
  outcomeOrderCoin,
  type OutcomeSideIndex,
} from './outcomeOrders';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
const transport = new HttpTransport();

const DRAW_RE = /\b(draw|tie|x\b|empate|unentschieden|nul)\b/i;
const YES_NO_RE = /^(yes|no|oui|non|ja|nein)$/i;

type AutoBettingUser = {
  wallet: string;
  userId: string;
  allowWin: boolean;
  allowDraw: boolean;
  allowLoss: boolean;
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

function classifyLeg(name: string, index: number, legCount: number): LegKind {
  const n = name.trim();
  if (DRAW_RE.test(n)) return 'draw';
  if (YES_NO_RE.test(n) || legCount === 1) return 'yes_no';
  if (legCount >= 2 && index === 0) return 'win';
  if (legCount >= 2 && index === legCount - 1) return 'loss';
  if (legCount === 3 && index === 1) return 'draw';
  return 'other';
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

async function loadAutoBettingUsers(limit = 40): Promise<AutoBettingUser[]> {
  const { data, error } = await supabase
    .from('vault_settings')
    .select(
      'wallet_address, user_id, auto_betting_allow_win, auto_betting_allow_draw, auto_betting_allow_loss'
    )
    .eq('auto_betting_enabled', true)
    .limit(limit);

  if (error) {
    logger.warn('auto-betting users query failed', { error: error.message });
    return [];
  }

  const out: AutoBettingUser[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const wallet = String(row.wallet_address ?? '')
      .trim()
      .toLowerCase();
    const userId = String(row.user_id ?? '');
    if (!wallet || !userId || seen.has(wallet)) continue;
    seen.add(wallet);
    out.push({
      wallet,
      userId,
      allowWin: row.auto_betting_allow_win !== false,
      allowDraw: row.auto_betting_allow_draw !== false,
      allowLoss: row.auto_betting_allow_loss !== false,
    });
  }
  return out;
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
  size: number;
  entryPx: number;
  entryNtl: number;
}): Promise<void> {
  const now = new Date().toISOString();
  const balanceCoin = outcomeBalanceCoin(opts.outcomeId, opts.side);
  await supabase.from('hl_betting_positions').upsert(
    {
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
      opened_at: now,
      updated_at: now,
    },
    { onConflict: 'user_id,wallet_address,balance_coin' }
  );
}

async function placeBet(user: AutoBettingUser, candidate: Candidate): Promise<boolean> {
  const spotUsd = await fetchHlSpotUsdcUsd(user.wallet);
  const riskFrac = config.hyperliquid.autoBettingRiskFraction;
  const stakeUsd = Math.max(
    OUTCOME_MIN_NOTIONAL_USD,
    Math.min(spotUsd * riskFrac, spotUsd * 0.25)
  );
  if (spotUsd < OUTCOME_MIN_NOTIONAL_USD) {
    logger.debug('auto-bet skip — spot USDC low', {
      wallet: user.wallet.slice(0, 10),
      spotUsd: spotUsd.toFixed(2),
    });
    return false;
  }

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
  if (notional < OUTCOME_MIN_NOTIONAL_USD) return false;

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

  await recordAiOpen({
    userId: user.userId,
    wallet: user.wallet,
    outcomeId: candidate.outcomeId,
    side: candidate.side,
    marketName: candidate.marketName,
    sideLabel: `${candidate.sideLabel} · ${candidate.legKind}`,
    size,
    entryPx: refPx,
    entryNtl: notional,
  });

  lastBetAt.set(user.wallet, Date.now());
  logger.info('AI auto-bet placed', {
    wallet: user.wallet.slice(0, 10),
    market: candidate.marketName.slice(0, 48),
    side: candidate.sideLabel,
    kind: candidate.legKind,
    lean: candidate.leanPct,
    size,
    notional: notional.toFixed(2),
    reason: candidate.reasoning.slice(0, 120),
  });
  return true;
}

async function processUser(user: AutoBettingUser): Promise<'ok' | 'skip' | 'fail'> {
  try {
    const last = lastBetAt.get(user.wallet) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) return 'skip';

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
