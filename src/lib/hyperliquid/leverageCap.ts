import { fetchHlMarkets } from './markets';

export type HlLeverageCaps = {
  /** Max leverage shown on bot LVRG slider (HL per-asset caps apply at execution). */
  sliderMax: number;
  btc: number;
  eth: number;
};

const FALLBACK: HlLeverageCaps = { sliderMax: 40, btc: 40, eth: 25 };

/** Live caps from Hyperliquid meta — BTC is the bot slider ceiling (perps clamp per coin on trade). */
export async function fetchHlLeverageCaps(): Promise<HlLeverageCaps> {
  try {
    const markets = await fetchHlMarkets();
    if (markets.length === 0) return FALLBACK;

    const byName = new Map(markets.map((m) => [m.name, m.maxLeverage]));
    const btc = byName.get('BTC') ?? FALLBACK.btc;
    const eth = byName.get('ETH') ?? FALLBACK.eth;
    const sliderMax = Math.max(1, Math.round(btc));

    return { sliderMax, btc, eth };
  } catch {
    return FALLBACK;
  }
}
