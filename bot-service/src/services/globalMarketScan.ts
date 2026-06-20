import { config } from '../config';
import { logger } from '../utils/logger';
import { mapPool } from '../utils/asyncPool';
import { analyzeMarketMTFBySymbol, type TradingStrategy } from './market';
import { analyzeAggressiveScalpBySymbol } from './aggressiveScalpAnalysis';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { fetchHlLiquidUniverse, type HlLiquidUniverse } from './hlLiquidity';
import { filterWeekendShortOnly, isWeekendShortOnlyWindow } from './weekendTradingRules';
import { validatePreTradeLiquidity } from './liquiditySweepGate';

export type BotSignalMode = 'standard' | 'aggressive';

export type GlobalSignalCandidate = {
  coin: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  reason: string;
  dayVolumeUsd: number;
  openInterestUsd: number;
  botMode: BotSignalMode;
};

const STANDARD_STRATEGY: TradingStrategy = 'normal';

export type HlGlobalScanStats = {
  coinsScanned: number;
  liquidUniverse: number;
  standardCandidates: number;
  aggressiveCandidates: number;
  candidates: number;
  scannedAt: string;
};

export type GlobalScanResult = {
  standard: GlobalSignalCandidate[];
  aggressive: GlobalSignalCandidate[];
};

export let lastHlGlobalScanStats: HlGlobalScanStats = {
  coinsScanned: 0,
  liquidUniverse: 0,
  standardCandidates: 0,
  aggressiveCandidates: 0,
  candidates: 0,
  scannedAt: '',
};

export let lastGlobalScanResult: GlobalScanResult = { standard: [], aggressive: [] };

async function scanStandardCoin(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number }
): Promise<GlobalSignalCandidate | null> {
  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const analysis = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (!analysis || analysis.isWeak) return null;
    if (analysis.direction !== 'LONG' && analysis.direction !== 'SHORT') return null;
    if (analysis.confidence < config.hyperliquid.minSignalConfidence) return null;
    if ((analysis.metrics?.directionalTfCount ?? 0) < 3) return null;
    if ((analysis.metrics?.trendAlignment ?? 0) < 75) return null;
    if (
      (analysis.direction === 'LONG' && analysis.metrics?.h1Trend === 'DOWN') ||
      (analysis.direction === 'SHORT' && analysis.metrics?.h1Trend === 'UP')
    ) {
      return null;
    }
    const liqGate = await validatePreTradeLiquidity({
      symbol,
      direction: analysis.direction,
      dayVolumeUsd: liq.dayVolumeUsd,
      timeframe: '5m',
    });
    if (!liqGate.ok) return null;
    return {
      coin,
      symbol,
      direction: analysis.direction,
      confidence: analysis.confidence,
      reason: analysis.reason,
      dayVolumeUsd: liq.dayVolumeUsd,
      openInterestUsd: liq.openInterestUsd,
      botMode: 'standard',
    };
  } catch {
    return null;
  }
}

async function scanAggressiveCoin(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number }
): Promise<GlobalSignalCandidate | null> {
  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const scalp = await analyzeAggressiveScalpBySymbol(symbol);
    const minConf = Math.max(62, config.hyperliquid.minSignalConfidence - 3);
    if (!scalp || scalp.confidence < minConf) return null;
    return {
      coin,
      symbol,
      direction: scalp.direction,
      confidence: scalp.confidence,
      reason: scalp.reason,
      dayVolumeUsd: liq.dayVolumeUsd,
      openInterestUsd: liq.openInterestUsd,
      botMode: 'aggressive',
    };
  } catch {
    return null;
  }
}

/** Scan liquid HL perps — Standard (MTF) + Aggressive (6×1m → next 3, 5m confirm). */
export async function scanGlobalHlSignals(
  preloadedUniverse?: HlLiquidUniverse
): Promise<GlobalScanResult> {
  const started = Date.now();
  const universe = preloadedUniverse ?? (await fetchHlLiquidUniverse());
  const coins = universe.coins;
  const concurrency = config.scaling.globalScanConcurrency;
  const liqByCoin = new Map(universe.markets.map((m) => [m.coin, m]));

  if (coins.length === 0) {
    lastHlGlobalScanStats = {
      coinsScanned: 0,
      liquidUniverse: 0,
      standardCandidates: 0,
      aggressiveCandidates: 0,
      candidates: 0,
      scannedAt: new Date().toISOString(),
    };
    lastGlobalScanResult = { standard: [], aggressive: [] };
    return lastGlobalScanResult;
  }

  const [standardRaw, aggressiveRaw] = await Promise.all([
    mapPool(coins, concurrency, async (coin) => {
      const liq = liqByCoin.get(coin);
      if (!liq) return null;
      return scanStandardCoin(coin, liq);
    }),
    mapPool(coins, concurrency, async (coin) => {
      const liq = liqByCoin.get(coin);
      if (!liq) return null;
      return scanAggressiveCoin(coin, liq);
    }),
  ]);

  const standard = standardRaw
    .filter((c): c is GlobalSignalCandidate => c !== null)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd || b.confidence - a.confidence);

  const aggressive = aggressiveRaw
    .filter((c): c is GlobalSignalCandidate => c !== null)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd || b.confidence - a.confidence);

  const standardFiltered = filterWeekendShortOnly(standard);
  const aggressiveFiltered = filterWeekendShortOnly(aggressive);

  lastGlobalScanResult = { standard: standardFiltered, aggressive: aggressiveFiltered };
  lastHlGlobalScanStats = {
    coinsScanned: coins.length,
    liquidUniverse: coins.length,
    standardCandidates: standardFiltered.length,
    aggressiveCandidates: aggressiveFiltered.length,
    candidates: standardFiltered.length + aggressiveFiltered.length,
    scannedAt: new Date().toISOString(),
  };

  logger.info('Global HL signal scan complete', {
    liquidCoins: coins.length,
    standard: standardFiltered.length,
    aggressive: aggressiveFiltered.length,
    weekendShortOnly: isWeekendShortOnlyWindow(),
    topStandard: standardFiltered[0]?.coin,
    topAggressive: aggressiveFiltered[0]?.coin,
    ms: Date.now() - started,
  });

  return lastGlobalScanResult;
}

export function globalSignalsForBotMode(
  scan: GlobalScanResult,
  hlBotStrategy: string | null | undefined
): GlobalSignalCandidate[] {
  if (hlBotStrategy === 'profit_grabber') return scan.aggressive;
  return scan.standard;
}
