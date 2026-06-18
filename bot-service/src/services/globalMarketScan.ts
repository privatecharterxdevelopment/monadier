import { config } from '../config';
import { logger } from '../utils/logger';
import { mapPool } from '../utils/asyncPool';
import { analyzeMarketMTFBySymbol, type TradingStrategy } from './market';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { listHlTradableCoins } from './hlInfo';

export type GlobalSignalCandidate = {
  coin: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  reason: string;
};

const DEFAULT_STRATEGY: TradingStrategy = 'aggressive';

/**
 * Scan all HL perps once per trading cycle.
 * Direction/confidence are user-agnostic — sizing is applied per user later.
 */
export async function scanGlobalHlSignals(): Promise<GlobalSignalCandidate[]> {
  const started = Date.now();
  const coins = await listHlTradableCoins();
  const minConf = config.hyperliquid.minSignalConfidence;
  const concurrency = config.scaling.globalScanConcurrency;

  const scanned = await mapPool(coins, concurrency, async (coin) => {
    try {
      const symbol = hlCoinToBinanceSymbol(coin);
      const analysis = await analyzeMarketMTFBySymbol(symbol, DEFAULT_STRATEGY);
      if (!analysis || analysis.isWeak) return null;
      if (analysis.direction !== 'LONG' && analysis.direction !== 'SHORT') return null;
      if (analysis.confidence < minConf) return null;
      return {
        coin,
        symbol,
        direction: analysis.direction,
        confidence: analysis.confidence,
        reason: analysis.reason,
      } satisfies GlobalSignalCandidate;
    } catch {
      return null;
    }
  });

  const candidates = scanned
    .filter((c): c is GlobalSignalCandidate => c !== null)
    .sort((a, b) => b.confidence - a.confidence);

  logger.info('Global HL signal scan complete', {
    coins: coins.length,
    candidates: candidates.length,
    topCoin: candidates[0]?.coin,
    topConf: candidates[0]?.confidence,
    ms: Date.now() - started,
  });

  return candidates;
}
