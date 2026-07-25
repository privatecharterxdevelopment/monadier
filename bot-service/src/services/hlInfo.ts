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
  userAddress: string
): Promise<HlClearinghouseState | null> {
  const user = userAddress.toLowerCase();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(config.hyperliquid.infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user,
        }),
      });
      if (!res.ok) {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      return (await res.json()) as HlClearinghouseState;
    } catch (err: unknown) {
      if (attempt === 2) {
        logger.debug('HL clearinghouseState failed', {
          user: user.slice(0, 10),
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }
  return null;
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
  return {
    perpUsd,
    spotUsdcUsd,
    tradablePerpUsd,
    unifiedAccount,
    withdrawableUsd: unifiedAccount
      ? Math.max(perpWithdrawable, spotUsdcUsd, tradablePerpUsd)
      : perpWithdrawable,
    stateLoaded: state != null,
  };
}

/** User-facing reason when tradable perp balance is below min. */
export function describeHlPerpBalanceBlocker(
  funding: HlPerpFundingSnapshot,
  minUsd: number
): string | null {
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
    const derived = Math.max(0, funding.tradablePerpUsd - marginUsed);
    return Math.max(0, Math.min(derived, funding.withdrawableUsd) - 1);
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
  const res = await fetch(config.hyperliquid.infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'meta' }),
  });
  if (!res.ok) throw new Error('HL meta fetch failed');
  return res.json();
}

export async function fetchHlAllMids(): Promise<Record<string, string>> {
  const res = await fetch(config.hyperliquid.infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'allMids' }),
  });
  if (!res.ok) throw new Error('HL allMids fetch failed');
  return res.json();
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
