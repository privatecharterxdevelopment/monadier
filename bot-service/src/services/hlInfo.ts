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
      leverage?: { value?: number; type?: 'cross' | 'isolated' };
    };
  }>;
};

export async function fetchHlClearinghouseState(
  userAddress: string
): Promise<HlClearinghouseState | null> {
  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: userAddress.toLowerCase(),
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as HlClearinghouseState;
  } catch (err: unknown) {
    logger.debug('HL clearinghouseState failed', {
      user: userAddress.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
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
