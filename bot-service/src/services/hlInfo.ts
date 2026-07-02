import { config } from '../config';
import { logger } from '../utils/logger';

/** User-facing copy when HL /info or exchange returns 429. */
export function sanitizeHlApiError(message: string): string {
  const cleaned = message.replace(/\s*-\s*null\s*$/i, '').trim();
  if (/429|too many requests/i.test(cleaned)) {
    return 'Hyperliquid rate limit — wait ~30 seconds and retry.';
  }
  return cleaned || 'Hyperliquid request failed — try again.';
}

let hlInfoQueue: Promise<void> = Promise.resolve();
let lastHlInfoAt = 0;
let hlRateLimitUntil = 0;
const HL_INFO_GAP_MS = 150;
const HL_RATE_LIMIT_PAUSE_MS = 28_000;

const chStateCache = new Map<string, { at: number; data: HlClearinghouseState | null }>();
const CH_STATE_TTL_MS = 3_500;

let metaCache: { at: number; data: Awaited<ReturnType<typeof fetchHlMetaUncached>> } | null = null;
const META_TTL_MS = 45_000;

let midsCache: { at: number; data: Record<string, string> } | null = null;
const MIDS_TTL_MS = 2_500;

async function throttleHlInfo<T>(run: () => Promise<T>): Promise<T> {
  const scheduled = hlInfoQueue.then(async () => {
    const wait = Math.max(
      0,
      hlRateLimitUntil - Date.now(),
      HL_INFO_GAP_MS - (Date.now() - lastHlInfoAt)
    );
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHlInfoAt = Date.now();
    return run();
  });
  hlInfoQueue = scheduled.then(
    () => undefined,
    () => undefined
  );
  return scheduled;
}

async function hlInfoPostRaw(body: Record<string, unknown>): Promise<Response> {
  return throttleHlInfo(() =>
    fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

function retryDelayMs(attempt: number, status: number): number {
  if (status === 429) return 1_500 * 2 ** attempt;
  return 350 * (attempt + 1);
}

export type HlClearinghouseState = {
  marginSummary?: {
    accountValue?: string;
    totalMarginUsed?: string;
    totalRawUsd?: string;
  };
  crossMarginSummary?: {
    accountValue?: string;
    totalMarginUsed?: string;
    totalRawUsd?: string;
  };
  withdrawable?: string;
  assetPositions?: Array<{
    position?: {
      coin?: string;
      szi?: string;
      entryPx?: string;
      unrealizedPnl?: string;
      marginUsed?: string;
      leverage?: { value?: number; type?: 'cross' | 'isolated' };
    };
  }>;
};

export type HlUserAbstraction =
  | 'unifiedAccount'
  | 'portfolioMargin'
  | 'disabled'
  | 'default'
  | 'dexAbstraction';

export function normalizeHlUserAbstraction(raw: unknown): HlUserAbstraction | null {
  if (raw == null) return null;
  let mode = typeof raw === 'string' ? raw.trim() : String(raw);
  mode = mode.replace(/^"+|"+$/g, '');
  if (
    mode === 'unifiedAccount' ||
    mode === 'portfolioMargin' ||
    mode === 'disabled' ||
    mode === 'default' ||
    mode === 'dexAbstraction'
  ) {
    return mode;
  }
  return null;
}

/** Unified + portfolio margin + HL default mode (new accounts). */
export function isHlUnifiedMargin(mode: HlUserAbstraction | null | undefined): boolean {
  return (
    mode === 'unifiedAccount' ||
    mode === 'portfolioMargin' ||
    mode === 'default' ||
    mode === 'dexAbstraction'
  );
}

/** Unified/PM accounts often report $0 perp summary while USDC sits in spot. */
export function inferHlUnifiedMargin(
  perpUsd: number,
  spotUsdcUsd: number,
  abstraction: HlUserAbstraction | null
): boolean {
  if (isHlUnifiedMargin(abstraction)) return true;
  if (spotUsdcUsd >= 1 && spotUsdcUsd > perpUsd + 1) return true;
  // HL default / unified: spot can read $0 while perp summary is partial — trust abstraction.
  if (abstraction === null && perpUsd >= 0.01 && spotUsdcUsd < 1) {
    return false;
  }
  if (perpUsd >= 0.01 && spotUsdcUsd < 1) return false;
  return abstraction == null;
}

function hlSummaryAccountValueUsd(state: HlClearinghouseState | null): number {
  const margin = state?.marginSummary?.accountValue;
  const cross = state?.crossMarginSummary?.accountValue;
  const marginRaw = state?.marginSummary?.totalRawUsd;
  const crossRaw = state?.crossMarginSummary?.totalRawUsd;
  const values = [margin, cross, marginRaw, crossRaw].map((v) => Number(v ?? 0));
  return Math.max(0, ...values.filter((n) => Number.isFinite(n)));
}

export async function fetchHlUserAbstraction(
  userAddress: string
): Promise<HlUserAbstraction | null> {
  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userAbstraction',
        user: userAddress.toLowerCase(),
      }),
    });
    if (!res.ok) return null;
    return normalizeHlUserAbstraction(await res.json());
  } catch {
    return null;
  }
}

export async function fetchHlClearinghouseState(
  userAddress: string,
  opts?: { fresh?: boolean }
): Promise<HlClearinghouseState | null> {
  const user = userAddress.toLowerCase();
  if (!opts?.fresh) {
    const hit = chStateCache.get(user);
    if (hit && Date.now() - hit.at < CH_STATE_TTL_MS) return hit.data;
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await hlInfoPostRaw({
        type: 'clearinghouseState',
        user,
      });
      if (res.status === 429) {
        hlRateLimitUntil = Date.now() + HL_RATE_LIMIT_PAUSE_MS;
        if (attempt < 3) await new Promise((r) => setTimeout(r, retryDelayMs(attempt, 429)));
        continue;
      }
      if (!res.ok) {
        if (attempt < 3) await new Promise((r) => setTimeout(r, retryDelayMs(attempt, res.status)));
        continue;
      }
      const data = (await res.json()) as HlClearinghouseState;
      chStateCache.set(user, { at: Date.now(), data });
      return data;
    } catch (err: unknown) {
      if (attempt === 3) {
        logger.debug('HL clearinghouseState failed', {
          user: user.slice(0, 10),
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        await new Promise((r) => setTimeout(r, retryDelayMs(attempt, 0)));
      }
    }
  }
  return null;
}

/** Bust cached clearinghouse reads after a confirmed close. */
export function invalidateHlClearinghouseCache(userAddress: string): void {
  chStateCache.delete(userAddress.toLowerCase());
}

/** USDC sitting in HL spot — on unified accounts this is the tradable perp balance too. */
export async function fetchHlSpotUsdcUsd(userAddress: string): Promise<number> {
  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'spotClearinghouseState',
        user: userAddress.toLowerCase(),
      }),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as {
      balances?: Array<{ coin?: string; total?: string }>;
    };
    const row = (data.balances ?? []).find((b) => String(b.coin ?? '').toUpperCase() === 'USDC');
    const n = row?.total != null ? Number(row.total) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

async function fetchHlSpotUsdcUsdWithRetry(userAddress: string): Promise<number> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const n = await fetchHlSpotUsdcUsd(userAddress);
    if (n > 0) return n;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return 0;
}

export type HlPerpFundingSnapshot = {
  perpUsd: number;
  spotUsdcUsd: number;
  tradablePerpUsd: number;
  /** Total account equity for min-deposit gates — not free margin for the next slot. */
  accountEquityUsd: number;
  unifiedAccount: boolean;
  withdrawableUsd: number;
  stateLoaded: boolean;
};

export function hlCrossAccountValueUsd(state: HlClearinghouseState | null): number {
  const raw = state?.crossMarginSummary?.accountValue;
  const n = raw != null ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function hlSummaryMarginUsedUsd(state: HlClearinghouseState | null): number {
  const margin = state?.marginSummary?.totalMarginUsed;
  const cross = state?.crossMarginSummary?.totalMarginUsed;
  const marginN = margin != null ? Number(margin) : 0;
  const crossN = cross != null ? Number(cross) : 0;
  return Math.max(
    Number.isFinite(marginN) ? marginN : 0,
    Number.isFinite(crossN) ? crossN : 0
  );
}

/** Sum marginUsed across open positions (isolated wallets may not reflect in summary). */
export function hlPositionsMarginUsedUsd(state: HlClearinghouseState | null): number {
  let sum = 0;
  for (const row of state?.assetPositions ?? []) {
    const n = Number(row.position?.marginUsed ?? 0);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return sum;
}

/** Total HL equity for min-account checks (perp + spot + cross summary + locked margin). */
export function hlTotalAccountEquityUsd(
  perpUsd: number,
  spotUsdcUsd: number,
  unifiedAccount: boolean,
  crossAccountValueUsd: number,
  state: HlClearinghouseState | null
): number {
  const combined = unifiedAccount ? Math.max(perpUsd, spotUsdcUsd) : perpUsd + spotUsdcUsd;
  const marginUsed = Math.max(hlSummaryMarginUsedUsd(state), hlPositionsMarginUsedUsd(state));
  const withdrawable = hlWithdrawableUsd(state);
  const reconstructed = withdrawable + marginUsed;
  return Math.max(combined, crossAccountValueUsd, perpUsd, reconstructed, spotUsdcUsd);
}

export function hlTradablePerpUsd(
  perpUsd: number,
  spotUsdcUsd: number,
  unified: boolean
): number {
  if (unified) return Math.max(perpUsd, spotUsdcUsd);
  return perpUsd;
}

async function fetchHlPerpFundingSnapshotOnce(
  userAddress: string
): Promise<HlPerpFundingSnapshot> {
  const [state, spotUsdcUsd, abstraction] = await Promise.all([
    fetchHlClearinghouseState(userAddress),
    fetchHlSpotUsdcUsdWithRetry(userAddress),
    fetchHlUserAbstraction(userAddress),
  ]);
  const perpUsd = hlAccountValueUsd(state);
  const crossUsd = hlCrossAccountValueUsd(state);
  const unifiedAccount =
    isHlUnifiedMargin(abstraction) || inferHlUnifiedMargin(perpUsd, spotUsdcUsd, abstraction);
  let tradablePerpUsd = hlTradablePerpUsd(perpUsd, spotUsdcUsd, unifiedAccount);
  let accountEquityUsd = hlTotalAccountEquityUsd(
    perpUsd,
    spotUsdcUsd,
    unifiedAccount,
    crossUsd,
    state
  );
  if (unifiedAccount) {
    // HL unified/PM: spot clearinghouse is the trading balance source of truth.
    accountEquityUsd = Math.max(spotUsdcUsd, accountEquityUsd, perpUsd, crossUsd);
    tradablePerpUsd = Math.max(spotUsdcUsd, perpUsd);
  }
  const perpWithdrawable = hlWithdrawableUsd(state);
  return {
    perpUsd,
    spotUsdcUsd,
    tradablePerpUsd,
    accountEquityUsd,
    unifiedAccount,
    withdrawableUsd: unifiedAccount
      ? Math.max(perpWithdrawable, spotUsdcUsd, tradablePerpUsd)
      : perpWithdrawable,
    stateLoaded: state != null || spotUsdcUsd >= 0.01,
  };
}

/** Live HL balance for bot gates — retries when API reads empty but state loaded. */
export async function fetchHlPerpFundingSnapshot(
  userAddress: string
): Promise<HlPerpFundingSnapshot> {
  let snapshot = await fetchHlPerpFundingSnapshotOnce(userAddress);
  for (let attempt = 0; attempt < 4; attempt++) {
    const needsRetry =
      !snapshot.stateLoaded ||
      (snapshot.accountEquityUsd < 0.01 &&
        snapshot.tradablePerpUsd < 0.01 &&
        snapshot.perpUsd < 0.01 &&
        snapshot.spotUsdcUsd < 0.01);
    if (!needsRetry) break;
    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    snapshot = await fetchHlPerpFundingSnapshotOnce(userAddress);
  }
  return snapshot;
}

/** User-facing reason when total account equity is below min (not free margin alone). */
export function describeHlPerpBalanceBlocker(
  funding: HlPerpFundingSnapshot,
  minUsd: number
): string | null {
  const equityUsd = funding.accountEquityUsd;
  if (!funding.stateLoaded && equityUsd < minUsd) {
    return 'HL balance check failed — retrying Hyperliquid account read';
  }
  if (equityUsd >= minUsd) return null;

  if (!funding.unifiedAccount && funding.spotUsdcUsd >= minUsd) {
    return `Perp margin $${funding.perpUsd.toFixed(2)} — you have $${funding.spotUsdcUsd.toFixed(2)} USDC on HL Spot; transfer to Perps in Funds tab (bot trades perps only)`;
  }

  const total = funding.perpUsd + funding.spotUsdcUsd;
  if (!funding.unifiedAccount && total >= minUsd) {
    return `Perp margin $${funding.perpUsd.toFixed(2)} + spot $${funding.spotUsdcUsd.toFixed(2)} — move USDC to Perps to trade (min $${minUsd})`;
  }

  return (
    `HL account equity $${equityUsd.toFixed(2)} (min $${minUsd}) — ` +
    `free margin $${funding.withdrawableUsd.toFixed(2)} · perp $${funding.perpUsd.toFixed(2)} · spot $${funding.spotUsdcUsd.toFixed(2)}`
  );
}

export function hlAccountValueUsd(state: HlClearinghouseState | null): number {
  return hlSummaryAccountValueUsd(state);
}

export function hlWithdrawableUsd(state: HlClearinghouseState | null): number {
  const raw = state?.withdrawable;
  const n = raw != null ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function hlMarginUsedUsd(state: HlClearinghouseState | null): number {
  return Math.max(hlSummaryMarginUsedUsd(state), hlPositionsMarginUsedUsd(state));
}

/** USD available to open another HL perp (withdrawable, cross-checked vs balance − margin used). */
export function hlFreeMarginUsd(state: HlClearinghouseState | null): number {
  const balance = hlAccountValueUsd(state);
  const withdrawable = hlWithdrawableUsd(state);
  const marginUsed = hlMarginUsedUsd(state);
  const derived = Math.max(0, balance - marginUsed);
  return Math.max(0, Math.min(withdrawable, derived) - 1);
}

/** Free margin for opening trades — unified accounts use spot USDC, not perp clearinghouse. */
export function hlTradableFreeMarginUsd(
  funding: HlPerpFundingSnapshot,
  state: HlClearinghouseState | null
): number {
  if (!funding.stateLoaded) return 0;
  if (funding.unifiedAccount) {
    const marginUsed = hlMarginUsedUsd(state);
    const base = Math.max(
      funding.tradablePerpUsd,
      funding.spotUsdcUsd,
      funding.accountEquityUsd
    );
    const derived = Math.max(0, base - marginUsed);
    const cap = Math.max(funding.withdrawableUsd, derived);
    return Math.max(0, Math.min(derived, cap) - 1);
  }
  return hlFreeMarginUsd(state);
}

export function hlOpenPerpCoins(state: HlClearinghouseState | null): string[] {
  const coins: string[] = [];
  for (const row of state?.assetPositions ?? []) {
    const coin = row.position?.coin;
    const size = Number(row.position?.szi ?? 0);
    if (coin && Number.isFinite(size) && Math.abs(size) > 0) {
      coins.push(coin);
    }
  }
  return coins;
}

export type HlExtraAgent = {
  address: string;
  name: string;
  validUntil: number;
};

export type HlExtraAgentsResult = {
  agents: HlExtraAgent[];
  /** false when HL /info failed after retries — empty agents then means unknown, not revoked */
  loaded: boolean;
};

function parseHlExtraAgents(rows: unknown): HlExtraAgent[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({
      address: String((r as { address?: string }).address ?? '').toLowerCase(),
      name: String((r as { name?: string }).name ?? ''),
      validUntil: Number((r as { validUntil?: number }).validUntil ?? 0),
    }))
    .filter((r) => r.address.length >= 42);
}

const extraAgentsCache = new Map<string, { at: number; result: HlExtraAgentsResult }>();
const EXTRA_AGENTS_CACHE_MS = 90_000;
const EXTRA_AGENTS_STALE_MS = 10 * 60_000;

function readExtraAgentsCache(user: string, maxAgeMs: number): HlExtraAgentsResult | null {
  const row = extraAgentsCache.get(user);
  if (!row || Date.now() - row.at > maxAgeMs) return null;
  return row.result;
}

function writeExtraAgentsCache(user: string, result: HlExtraAgentsResult): void {
  extraAgentsCache.set(user, { at: Date.now(), result });
}

/** HL extraAgents — retried + cached (Railway→HL reads are often flaky; empty ≠ not approved). */
export async function fetchHlExtraAgents(userAddress: string): Promise<HlExtraAgentsResult> {
  const user = userAddress.toLowerCase();
  const fresh = readExtraAgentsCache(user, EXTRA_AGENTS_CACHE_MS);
  if (fresh) return fresh;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const res = await fetch(config.hyperliquid.infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'extraAgents',
          user,
        }),
      });
      if (!res.ok) {
        if (attempt < 5) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      const result: HlExtraAgentsResult = {
        agents: parseHlExtraAgents(await res.json()),
        loaded: true,
      };
      writeExtraAgentsCache(user, result);
      return result;
    } catch (err: unknown) {
      if (attempt === 5) {
        logger.debug('HL extraAgents failed', {
          user: user.slice(0, 10),
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }

  const stale = readExtraAgentsCache(user, EXTRA_AGENTS_STALE_MS);
  if (stale?.loaded && stale.agents.length > 0) {
    return stale;
  }

  return { agents: [], loaded: false };
}

export function isHlExtraAgentActive(agent: HlExtraAgent): boolean {
  return agent.validUntil > Date.now();
}

async function fetchHlMetaUncached(): Promise<{
  universe: { name: string; szDecimals: number; maxLeverage?: number; isDelisted?: boolean }[];
}> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await hlInfoPostRaw({ type: 'meta' });
      if (res.status === 429) {
        hlRateLimitUntil = Date.now() + HL_RATE_LIMIT_PAUSE_MS;
        if (attempt < 3) await new Promise((r) => setTimeout(r, retryDelayMs(attempt, 429)));
        continue;
      }
      if (!res.ok) {
        if (attempt < 3) await new Promise((r) => setTimeout(r, retryDelayMs(attempt, res.status)));
        continue;
      }
      return res.json();
    } catch (err: unknown) {
      if (attempt === 3) {
        logger.debug('HL meta failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        await new Promise((r) => setTimeout(r, retryDelayMs(attempt, 0)));
      }
    }
  }
  throw new Error('HL meta fetch failed');
}

export async function fetchHlMeta(): Promise<{
  universe: { name: string; szDecimals: number; maxLeverage?: number; isDelisted?: boolean }[];
}> {
  if (metaCache && Date.now() - metaCache.at < META_TTL_MS) return metaCache.data;
  const data = await fetchHlMetaUncached();
  metaCache = { at: Date.now(), data };
  return data;
}

export type HlUserFill = {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  closedPnl: string;
  fee: string;
  dir?: string;
};

export async function fetchHlUserFills(userAddress: string): Promise<HlUserFill[]> {
  const user = userAddress.toLowerCase();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(config.hyperliquid.infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'userFills', user }),
      });
      if (!res.ok) {
        if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
      const rows = (await res.json()) as HlUserFill[];
      return Array.isArray(rows) ? rows : [];
    } catch (err: unknown) {
      if (attempt === 3) {
        logger.debug('HL userFills failed', {
          user: user.slice(0, 10),
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }
  return [];
}

/** Sum all close fills for a coin since timestamp — HL may split one close into legs. */
export async function fetchHlRecentCloseFillSummary(
  userAddress: string,
  coin: string,
  sinceMs: number
): Promise<{
  closedPnlUsd: number;
  exitPx: number;
  size: number;
  fillCount: number;
} | null> {
  const fills = await fetchHlUserFills(userAddress);
  const coinUpper = coin.toUpperCase();
  const relevant = fills.filter((f) => {
    if (f.coin.toUpperCase() !== coinUpper || f.time < sinceMs) return false;
    const dir = (f.dir ?? '').toLowerCase();
    return dir.includes('close');
  });
  if (relevant.length === 0) return null;

  let totalSz = 0;
  let totalPnl = 0;
  let wPxSum = 0;
  for (const f of relevant) {
    const sz = Number(f.sz) || 0;
    const px = Number(f.px) || 0;
    totalSz += sz;
    totalPnl += Number(f.closedPnl) || 0;
    wPxSum += px * sz;
  }
  return {
    closedPnlUsd: totalPnl,
    exitPx: totalSz > 0 ? wPxSum / totalSz : Number(relevant[0].px) || 0,
    size: totalSz,
    fillCount: relevant.length,
  };
}

/** Poll HL fills after close — avoids recording snapshot uPnL when fills lag. */
export async function fetchHlRecentCloseFillSummaryWithRetry(
  userAddress: string,
  coin: string,
  sinceMs: number,
  opts?: { attempts?: number; delayMs?: number }
): Promise<{
  closedPnlUsd: number;
  exitPx: number;
  size: number;
  fillCount: number;
} | null> {
  const attempts = opts?.attempts ?? 5;
  const delayMs = opts?.delayMs ?? 400;
  for (let i = 0; i < attempts; i += 1) {
    const summary = await fetchHlRecentCloseFillSummary(userAddress, coin, sinceMs);
    if (summary) return summary;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  return null;
}

export async function fetchHlAllMids(): Promise<Record<string, string>> {
  if (midsCache && Date.now() - midsCache.at < MIDS_TTL_MS) return midsCache.data;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await hlInfoPostRaw({ type: 'allMids' });
      if (res.status === 429) {
        hlRateLimitUntil = Date.now() + HL_RATE_LIMIT_PAUSE_MS;
        if (attempt < 3) await new Promise((r) => setTimeout(r, retryDelayMs(attempt, 429)));
        continue;
      }
      if (!res.ok) {
        if (attempt < 3) await new Promise((r) => setTimeout(r, retryDelayMs(attempt, res.status)));
        continue;
      }
      const data = (await res.json()) as Record<string, string>;
      midsCache = { at: Date.now(), data };
      return data;
    } catch (err: unknown) {
      if (attempt === 3) {
        logger.debug('HL allMids failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        await new Promise((r) => setTimeout(r, retryDelayMs(attempt, 0)));
      }
    }
  }
  if (midsCache) return midsCache.data;
  throw new Error('HL allMids fetch failed');
}

export function maxLeverageForCoin(
  meta: { universe: { name: string; maxLeverage?: number }[] },
  coin: string
): number {
  const name = coin.toUpperCase().replace(/-PERP$/i, '');
  const asset = meta.universe.find((u) => u.name.toUpperCase() === name);
  const max = asset?.maxLeverage;
  return max && max > 0 ? max : 40;
}

export function coinToAssetIndex(meta: { universe: { name: string }[] }, coin: string): number {
  const name = coin.toUpperCase().replace(/-PERP$/i, '');
  const idx = meta.universe.findIndex((u) => u.name.toUpperCase() === name);
  if (idx < 0) throw new Error(`HL asset not found: ${coin}`);
  return idx;
}

export function formatHlSize(size: number, szDecimals: number): string {
  const factor = 10 ** szDecimals;
  const rounded = Math.floor(size * factor) / factor;
  return rounded.toFixed(szDecimals).replace(/\.?0+$/, '') || '0';
}

/** HL perp prices: max 5 sig figs, max (6 - szDecimals) decimal places. */
export function formatHlPrice(price: number, szDecimals = 0, isSpot = false): string {
  const maxDecimals = Math.max(0, (isSpot ? 8 : 6) - szDecimals);
  if (price > 100_000) return String(Math.round(price));
  const sig = Number.parseFloat(price.toPrecision(5));
  const rounded = Number(sig.toFixed(maxDecimals));
  let s = rounded.toFixed(maxDecimals);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}

/** Active HL perp coins (listed, has mark price). */
export async function listHlTradableCoins(): Promise<string[]> {
  const [meta, mids] = await Promise.all([fetchHlMeta(), fetchHlAllMids()]);
  return meta.universe
    .filter((u) => !u.isDelisted)
    .map((u) => u.name)
    .filter((name) => {
      const px = Number(mids[name] ?? mids[`${name}-PERP`] ?? 0);
      return Number.isFinite(px) && px > 0;
    });
}
