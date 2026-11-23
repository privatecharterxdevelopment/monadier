import { config } from '../config';
import { logger } from '../utils/logger';

export type HlClearinghouseState = {
  marginSummary?: {
    accountValue?: string;
    totalMarginUsed?: string;
  };
  withdrawable?: string;
  assetPositions?: Array<{
    position?: {
      coin?: string;
      szi?: string;
      entryPx?: string;
      unrealizedPnl?: string;
      positionValue?: string;
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

type ClearinghouseCacheEntry = { at: number; data: HlClearinghouseState };
const clearinghouseCache = new Map<string, ClearinghouseCacheEntry>();

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

/**
 * HL one-wallet margin. Matches frontend `src/lib/hyperliquid/funding.ts`:
 * modern modes share spot+perp; only explicit `disabled` is classic split.
 */
export function isHlUnifiedMargin(mode: HlUserAbstraction | null | undefined): boolean {
  return (
    mode === 'unifiedAccount' ||
    mode === 'portfolioMargin' ||
    mode === 'default' ||
    mode === 'dexAbstraction'
  );
}

/**
 * When userAbstraction flakes / lags, spot USDC sitting above perp equity still
 * means shared margin (HL unified). Never treat that as “$0 free / transfer to Perps”.
 */
export function inferHlUnifiedMargin(
  perpUsd: number,
  spotUsdcUsd: number,
  abstraction: HlUserAbstraction | null
): boolean {
  if (isHlUnifiedMargin(abstraction)) return true;
  if (spotUsdcUsd >= 1 && spotUsdcUsd > perpUsd + 1) return true;
  if (perpUsd >= 0.01 && spotUsdcUsd < 1) return false;
  // API miss → assume unified (HL default). Explicit `disabled` stays classic.
  return abstraction == null;
}

export async function fetchHlUserAbstraction(
  userAddress: string
): Promise<HlUserAbstraction | null> {
  const user = userAddress.toLowerCase();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(config.hyperliquid.infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'userAbstraction',
          user,
        }),
      });
      if (!res.ok) {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      return normalizeHlUserAbstraction(await res.json());
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  return null;
}

export async function fetchHlClearinghouseState(
  userAddress: string,
  opts?: { critical?: boolean }
): Promise<HlClearinghouseState | null> {
  const user = userAddress.toLowerCase();
  const ttlMs = opts?.critical ? 1_500 : 3_000;
  const attempts = opts?.critical ? 6 : 3;

  const hit = clearinghouseCache.get(user);
  if (hit && Date.now() - hit.at < ttlMs) {
    return hit.data;
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(config.hyperliquid.infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user,
        }),
        signal: AbortSignal.timeout(opts?.critical ? 12_000 : 8_000),
      });
      if (res.status === 429 || res.status >= 500) {
        if (hit) {
          logger.warn('HL clearinghouse rate-limited — serving stale', {
            user: user.slice(0, 10),
            status: res.status,
          });
          return hit.data;
        }
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1) * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        if (attempt < attempts - 1) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          continue;
        }
        break;
      }
      const data = (await res.json()) as HlClearinghouseState;
      clearinghouseCache.set(user, { at: Date.now(), data });
      return data;
    } catch (err: unknown) {
      if (hit && attempt >= attempts - 1) {
        logger.warn('HL clearinghouse error — serving stale', {
          user: user.slice(0, 10),
          error: err instanceof Error ? err.message : String(err),
        });
        return hit.data;
      }
      if (attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      } else {
        logger.debug('HL clearinghouseState failed', {
          user: user.slice(0, 10),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return hit ? hit.data : null;
}

/** USDC sitting in HL spot — on unified accounts this is the tradable perp balance too. */
export async function fetchHlSpotUsdcUsd(userAddress: string): Promise<number> {
  const user = userAddress.toLowerCase();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(config.hyperliquid.infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'spotClearinghouseState',
          user,
        }),
      });
      if (!res.ok) {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      const data = (await res.json()) as {
        balances?: Array<{ coin?: string; total?: string; hold?: string }>;
      };
      const row = (data.balances ?? []).find((b) => String(b.coin ?? '').toUpperCase() === 'USDC');
      const total = row?.total != null ? Number(row.total) : 0;
      if (Number.isFinite(total) && total > 0) return total;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  return 0;
}

export type HlPerpFundingSnapshot = {
  perpUsd: number;
  spotUsdcUsd: number;
  tradablePerpUsd: number;
  unifiedAccount: boolean;
  withdrawableUsd: number;
  stateLoaded: boolean;
};

export function hlTradablePerpUsd(
  perpUsd: number,
  spotUsdcUsd: number,
  unified: boolean
): number {
  if (unified) return Math.max(perpUsd, spotUsdcUsd);
  return perpUsd;
}

export async function fetchHlPerpFundingSnapshot(
  userAddress: string
): Promise<HlPerpFundingSnapshot> {
  const [state, spotUsdcUsd, abstraction] = await Promise.all([
    fetchHlClearinghouseState(userAddress),
    fetchHlSpotUsdcUsd(userAddress),
    fetchHlUserAbstraction(userAddress),
  ]);
  const perpUsd = hlAccountValueUsd(state);
  const unifiedAccount =
    isHlUnifiedMargin(abstraction) || inferHlUnifiedMargin(perpUsd, spotUsdcUsd, abstraction);
  const tradablePerpUsd = hlTradablePerpUsd(perpUsd, spotUsdcUsd, unifiedAccount);
  const perpWithdrawable = hlWithdrawableUsd(state);
  // Perp clearinghouse flakes often return null while Spot USDC still loads.
  // Spot-only success is enough to treat funding as loaded on unified books.
  const stateLoaded = state != null || spotUsdcUsd >= 1 || tradablePerpUsd >= 1;
  return {
    perpUsd,
    spotUsdcUsd,
    tradablePerpUsd,
    unifiedAccount,
    withdrawableUsd: Math.max(0, perpWithdrawable),
    stateLoaded,
  };
}

/** User-facing reason when tradable perp balance is below min. */
export function describeHlPerpBalanceBlocker(
  funding: HlPerpFundingSnapshot,
  minUsd: number
): string | null {
  // Never flash "balance check failed" when Spot USDC already proves the wallet is funded.
  if (funding.tradablePerpUsd >= minUsd || funding.spotUsdcUsd >= minUsd) {
    if (funding.unifiedAccount || funding.tradablePerpUsd >= minUsd) return null;
  }
  if (!funding.stateLoaded) {
    return 'HL balance check failed — retrying Hyperliquid account read';
  }
  if (funding.tradablePerpUsd >= minUsd) return null;

  if (!funding.unifiedAccount && funding.spotUsdcUsd >= minUsd) {
    return `Perp margin $${funding.perpUsd.toFixed(2)} — you have $${funding.spotUsdcUsd.toFixed(2)} USDC on HL Spot; transfer to Perps in Funds tab (bot trades perps only)`;
  }

  const total = funding.perpUsd + funding.spotUsdcUsd;
  if (!funding.unifiedAccount && total >= minUsd) {
    return `Perp margin $${funding.perpUsd.toFixed(2)} + spot $${funding.spotUsdcUsd.toFixed(2)} — move USDC to Perps to trade (min $${minUsd})`;
  }

  return `HL perp balance $${funding.tradablePerpUsd.toFixed(2)} (min $${minUsd})`;
}

export function hlAccountValueUsd(state: HlClearinghouseState | null): number {
  const raw = state?.marginSummary?.accountValue;
  const n = raw != null ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function hlWithdrawableUsd(state: HlClearinghouseState | null): number {
  const raw = state?.withdrawable;
  const n = raw != null ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function hlMarginUsedUsd(state: HlClearinghouseState | null): number {
  const raw = state?.marginSummary?.totalMarginUsed;
  const n = raw != null ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/** USD available to open another HL perp (withdrawable, cross-checked vs balance − margin used). */
export function hlFreeMarginUsd(state: HlClearinghouseState | null): number {
  const balance = hlAccountValueUsd(state);
  const withdrawable = hlWithdrawableUsd(state);
  const marginUsed = hlMarginUsedUsd(state);
  const derived = Math.max(0, balance - marginUsed);
  // Isolated positions often report withdrawable=$0 while accountValue − marginUsed
  // is still the true free collateral. Never let wd=0 wipe derived.
  const free = withdrawable >= 1 ? Math.min(withdrawable, derived) : derived;
  return Math.max(0, free - 1);
}

/**
 * Free margin for opening trades.
 * Unified: spot USDC is tradable collateral — subtract margin used.
 * Never min() with clearinghouse withdrawable=$0 (isolated books false-trip
 * "Insufficient margin — $0.00 free" while Trading balance still shows hundreds).
 */
export function hlTradableFreeMarginUsd(
  funding: HlPerpFundingSnapshot,
  state: HlClearinghouseState | null
): number {
  const marginUsed = hlMarginUsedUsd(state);
  // Unified / spot-backed books: use Spot USDC even when clearinghouseState timed out.
  if (funding.unifiedAccount || funding.spotUsdcUsd >= 1) {
    const equity = Math.max(
      funding.tradablePerpUsd,
      funding.spotUsdcUsd,
      funding.perpUsd,
      funding.withdrawableUsd,
      hlAccountValueUsd(state)
    );
    if (equity < 1 && !funding.stateLoaded) return 0;
    const derived = Math.max(0, equity - marginUsed);
    return Math.max(0, derived - 1);
  }
  if (!funding.stateLoaded) return 0;
  return hlFreeMarginUsd(state);
}

export function hlIsMeaningfulPerpPosition(
  size: number,
  entryPx: number,
  minNotionalUsd = 1
): boolean {
  if (!Number.isFinite(size) || Math.abs(size) <= 1e-12) return false;
  // Missing/zero entry → ghost/dust. Never consume a user slot (force-open
  // used to report "2/2 full" while the UI showed empty books).
  if (!Number.isFinite(entryPx) || entryPx <= 0) return false;
  const notional = Math.abs(size) * entryPx;
  return notional >= minNotionalUsd;
}

/** Tiny leftover size after a partial/floored close — must be flattened, not counted as a slot. */
export function hlResidualDustPositions(
  state: HlClearinghouseState | null,
  minNotionalUsd = 1
): Array<{ coin: string; size: number; entryPx: number; unrealizedPnl: number }> {
  const out: Array<{ coin: string; size: number; entryPx: number; unrealizedPnl: number }> = [];
  for (const row of state?.assetPositions ?? []) {
    const coin = row.position?.coin;
    const size = Number(row.position?.szi ?? 0);
    const entryPx = Number(row.position?.entryPx ?? 0);
    if (!coin || !Number.isFinite(size) || Math.abs(size) <= 1e-12) continue;
    if (hlIsMeaningfulPerpPosition(size, entryPx, minNotionalUsd)) continue;
    out.push({
      coin,
      size,
      entryPx,
      unrealizedPnl: Number(row.position?.unrealizedPnl ?? 0),
    });
  }
  return out;
}

export function hlOpenPerpCoins(state: HlClearinghouseState | null): string[] {
  const coins: string[] = [];
  for (const row of state?.assetPositions ?? []) {
    const coin = row.position?.coin;
    const size = Number(row.position?.szi ?? 0);
    const entryPx = Number(row.position?.entryPx ?? 0);
    if (coin && hlIsMeaningfulPerpPosition(size, entryPx)) {
      coins.push(coin);
    }
  }
  return coins;
}

/** Meaningful open sides — used to ban mixed LONG+SHORT books. */
export function hlOpenPerpSides(state: HlClearinghouseState | null): {
  longs: string[];
  shorts: string[];
} {
  const longs: string[] = [];
  const shorts: string[] = [];
  for (const row of state?.assetPositions ?? []) {
    const coin = row.position?.coin;
    const size = Number(row.position?.szi ?? 0);
    const entryPx = Number(row.position?.entryPx ?? 0);
    if (!coin || !hlIsMeaningfulPerpPosition(size, entryPx)) continue;
    if (size > 0) longs.push(coin);
    else shorts.push(coin);
  }
  return { longs, shorts };
}

export type HlExtraAgent = {
  address: string;
  name: string;
  validUntil: number;
};

export async function fetchHlExtraAgents(userAddress: string): Promise<HlExtraAgent[]> {
  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'extraAgents',
        user: userAddress.toLowerCase(),
      }),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      address?: string;
      name?: string;
      validUntil?: number;
    }>;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => ({
        address: String(r.address ?? '').toLowerCase(),
        name: String(r.name ?? ''),
        validUntil: Number(r.validUntil ?? 0),
      }))
      .filter((r) => r.address.length >= 42);
  } catch {
    return [];
  }
}

export function isHlExtraAgentActive(agent: HlExtraAgent): boolean {
  return agent.validUntil > Date.now();
}

export async function fetchHlMeta(): Promise<{
  universe: { name: string; szDecimals: number; maxLeverage?: number; isDelisted?: boolean }[];
}> {
  return fetchHlInfoCached('meta', { type: 'meta' }, META_TTL_MS);
}

export async function fetchHlAllMids(): Promise<Record<string, string>> {
  return fetchHlInfoCached('allMids', { type: 'allMids' }, MIDS_TTL_MS);
}

const META_TTL_MS = Number(process.env.HL_META_CACHE_MS || 30_000);
const MIDS_TTL_MS = Number(process.env.HL_MIDS_CACHE_MS || 5_000);

type HlInfoCacheEntry = { at: number; data: unknown };
const hlInfoCache = new Map<string, HlInfoCacheEntry>();

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Shared HL info POST with short TTL cache + stale fallback on 429/5xx.
 * Without this, 1s trade cycles + leaderboard + monitors stampede HL and
 * wipe entire open cycles (`HL meta fetch failed`).
 */
async function fetchHlInfoCached<T>(
  cacheKey: string,
  body: Record<string, unknown>,
  ttlMs: number
): Promise<T> {
  const hit = hlInfoCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttlMs) {
    return hit.data as T;
  }

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(config.hyperliquid.infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        if (hit) {
          logger.warn('HL info rate-limited — serving stale cache', {
            cacheKey,
            status: res.status,
            ageMs: Date.now() - hit.at,
          });
          return hit.data as T;
        }
        await sleep(250 * (attempt + 1) * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        throw new Error(`HL ${cacheKey} fetch failed (${res.status})`);
      }
      const data = (await res.json()) as T;
      hlInfoCache.set(cacheKey, { at: Date.now(), data });
      return data;
    } catch (err) {
      if (hit && attempt >= 2) {
        logger.warn('HL info fetch error — serving stale cache', {
          cacheKey,
          error: err instanceof Error ? err.message : String(err),
        });
        return hit.data as T;
      }
      if (attempt >= 2) throw err;
      await sleep(200 * (attempt + 1));
    }
  }

  if (hit) return hit.data as T;
  throw new Error(`HL ${cacheKey} fetch failed (${lastStatus || 'network'})`);
}

type HlRawFill = {
  coin?: string;
  closedPnl?: string | number;
  time?: number;
  dir?: string;
};

/**
 * Sum HL fill `closedPnl` for a coin close — source of truth for emails /
 * notifications / success fees (uPnL at trigger time can diverge from fills).
 */
export async function fetchHlCloseRealizedPnlUsd(opts: {
  userAddress: string;
  coin: string;
  /** Only fills at/after this ms (close order time − small slack). */
  sinceMs: number;
  lookbackMs?: number;
}): Promise<number | null> {
  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userFills',
        user: opts.userAddress.toLowerCase(),
        aggregateByTime: true,
      }),
    });
    if (!res.ok) return null;
    const fills = (await res.json()) as HlRawFill[];
    if (!Array.isArray(fills)) return null;

    const coin = opts.coin.toUpperCase();
    const since = opts.sinceMs - (opts.lookbackMs ?? 15_000);
    let sum = 0;
    let matched = 0;
    for (const f of fills) {
      if (String(f.coin ?? '').toUpperCase() !== coin) continue;
      const t = Number(f.time ?? 0);
      if (!Number.isFinite(t) || t < since) continue;
      const dir = String(f.dir ?? '');
      const pnl = Number(f.closedPnl ?? 0);
      const isClose =
        /^close/i.test(dir) ||
        /long\s*>\s*short|short\s*>\s*long/i.test(dir) ||
        (Number.isFinite(pnl) && pnl !== 0 && !/^open/i.test(dir));
      if (!isClose) continue;
      if (!Number.isFinite(pnl)) continue;
      sum += pnl;
      matched += 1;
    }
    if (matched === 0) return null;
    return Math.round(sum * 1e6) / 1e6;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('HL close realized pnl fetch failed', {
      coin: opts.coin,
      error: msg.slice(0, 160),
    });
    return null;
  }
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
  if (!Number.isFinite(size) || size <= 0) return '0';
  const factor = 10 ** szDecimals;
  // Math.round — Math.floor truncated float noise and left residual dust after closes.
  const rounded = Math.round(size * factor) / factor;
  if (rounded <= 0) {
    const minLot = 1 / factor;
    return minLot.toFixed(szDecimals).replace(/\.?0+$/, '') || '0';
  }
  return rounded.toFixed(szDecimals).replace(/\.?0+$/, '') || '0';
}

/** Reduce-only close size — ceil so we never under-close and leave dust. */
export function formatHlCloseSize(size: number, szDecimals: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0';
  const factor = 10 ** szDecimals;
  let rounded = Math.ceil(size * factor - 1e-12) / factor;
  if (rounded <= 0) rounded = 1 / factor;
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
