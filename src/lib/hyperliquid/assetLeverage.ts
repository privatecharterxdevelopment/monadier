import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import type { MarginMode } from '../../hooks/useHyperliquidTrading';

const transport = new HttpTransport();
const info = new InfoClient({ transport });

export type HlAssetLeverageState = {
  leverage: number;
  marginMode: MarginMode;
};

export async function fetchHlAssetLeverage(
  user: string,
  coin: string
): Promise<HlAssetLeverageState | null> {
  try {
    const data = await info.activeAssetData({
      user: user as `0x${string}`,
      coin,
    });
    const lev = data.leverage;
    if (!lev || lev.value <= 0) return null;
    return {
      leverage: lev.value,
      marginMode: lev.type === 'cross' ? 'cross' : 'isolated',
    };
  } catch {
    return null;
  }
}

export function leverageOptionsForMax(max: number): number[] {
  const cap = Math.max(1, Math.floor(max));
  const base = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100];
  const opts = base.filter((n) => n <= cap);
  if (!opts.includes(cap)) opts.push(cap);
  return opts.sort((a, b) => a - b);
}
