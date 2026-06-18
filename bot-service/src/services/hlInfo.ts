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
      leverage?: { value?: number };
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
  return size.toFixed(szDecimals);
}

export function formatHlPrice(price: number): string {
  const decimals = price >= 1000 ? 1 : price >= 10 ? 2 : 4;
  return price.toFixed(decimals);
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
