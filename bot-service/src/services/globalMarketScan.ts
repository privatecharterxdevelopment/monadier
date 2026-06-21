import { config } from '../config';
import { logger } from '../utils/logger';
import { mapPool } from '../utils/asyncPool';
import { analyzeMarketMTFBySymbol, type TradingStrategy } from './market';
import { analyzeAggressiveScalpBySymbol } from './aggressiveScalpAnalysis';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { fetchHlLiquidUniverse, type HlLiquidUniverse } from './hlLiquidity';
import { filterWeekendShortOnly, isWeekendShortOnlyWindow } from './weekendTradingRules';
import { validatePreTradeLiquidity } from './liquiditySweepGate';
import { validateEntryLocation } from './entryLocationGate';
import { validateMacroBetaAlignment } from './macroBetaGate';
import { validateEntryMomentum } from './entryMomentumGate';
import {
  refreshMegaPairVolumeMonitor,
  validateMegaPairVolumeForDirection,
} from './megaPairVolumeMonitor';

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
  mtfBreakdown?: string;
  trendAlignment?: number;
  directionalTfCount?: number;
  h1Trend?: string;
  liquidityReason?: string;
  locationReason?: string;
  macroReason?: string;
  momentumReason?: string;
  megaPairReason?: string;
  signalReasons?: string[];
  indicators?: string[];
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
    const locationGate = await validateEntryLocation({
      symbol,
      direction: analysis.direction,
    });
    if (!locationGate.ok) {
      logger.debug('HL scan skip: resistance/support', {
        coin,
        direction: analysis.direction,
        reason: locationGate.reason,
      });
      return null;
    }
    const macroGate = await validateMacroBetaAlignment({
      coin,
      direction: analysis.direction,
    });
    if (!macroGate.ok) {
      logger.debug('HL scan skip: macro beta', {
        coin,
        direction: analysis.direction,
        blockers: macroGate.blockers,
        reason: macroGate.reason,
      });
      return null;
    }
    const megaGate = validateMegaPairVolumeForDirection(analysis.direction);
    if (!megaGate.ok) {
      logger.debug('HL scan skip: mega pair volume', {
        coin,
        direction: analysis.direction,
        reason: megaGate.reason,
      });
      return null;
    }
    const momentumGate = await validateEntryMomentum({
      coin,
      direction: analysis.direction,
    });
    if (!momentumGate.ok) {
      logger.debug('HL scan skip: entry momentum', {
        coin,
        direction: analysis.direction,
        reason: momentumGate.reason,
      });
      return null;
    }
    return {
      coin,
      symbol,
      direction: analysis.direction,
      confidence: analysis.confidence,
      reason: analysis.reason,
      dayVolumeUsd: liq.dayVolumeUsd,
      openInterestUsd: liq.openInterestUsd,
      botMode: 'standard',
      mtfBreakdown: analysis.mtfBreakdown,
      trendAlignment: analysis.metrics?.trendAlignment,
      directionalTfCount: analysis.metrics?.directionalTfCount,
      h1Trend: analysis.metrics?.h1Trend,
      liquidityReason: liqGate.reason,
      locationReason: locationGate.reason,
      macroReason: macroGate.reason,
      momentumReason: momentumGate.reason,
      megaPairReason: megaGate.reason,
      signalReasons: analysis.signalReasons,
      indicators: analysis.indicators,
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

    const h1Check = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (h1Check) {
      if (scalp.direction === 'SHORT' && h1Check.metrics?.h1Trend === 'UP') {
        logger.debug('HL agg scan skip: 1h trend UP blocks SHORT', { coin });
        return null;
      }
      if (scalp.direction === 'LONG' && h1Check.metrics?.h1Trend === 'DOWN') {
        logger.debug('HL agg scan skip: 1h trend DOWN blocks LONG', { coin });
        return null;
      }
    }

    const liqGate = await validatePreTradeLiquidity({
      symbol,
      direction: scalp.direction,
      dayVolumeUsd: liq.dayVolumeUsd,
      timeframe: '1m',
    });
    if (!liqGate.ok) return null;
    const locationGate = await validateEntryLocation({
      symbol,
      direction: scalp.direction,
    });
    if (!locationGate.ok) {
      logger.debug('HL scan skip: resistance/support', {
        coin,
        direction: scalp.direction,
        reason: locationGate.reason,
      });
      return null;
    }
    const macroGate = await validateMacroBetaAlignment({
      coin,
      direction: scalp.direction,
    });
    if (!macroGate.ok) {
      logger.debug('HL scan skip: macro beta', {
        coin,
        direction: scalp.direction,
        blockers: macroGate.blockers,
      });
      return null;
    }
    const megaGate = validateMegaPairVolumeForDirection(scalp.direction);
    if (!megaGate.ok) {
      logger.debug('HL scan skip: mega pair volume', {
        coin,
        direction: scalp.direction,
        reason: megaGate.reason,
      });
      return null;
    }
    const momentumGate = await validateEntryMomentum({
      coin,
      direction: scalp.direction,
    });
    if (!momentumGate.ok) {
      logger.debug('HL scan skip: entry momentum', {
        coin,
        direction: scalp.direction,
        reason: momentumGate.reason,
      });
      return null;
    }
    return {
      coin,
      symbol,
      direction: scalp.direction,
      confidence: scalp.confidence,
      reason: scalp.reason,
      dayVolumeUsd: liq.dayVolumeUsd,
      openInterestUsd: liq.openInterestUsd,
      botMode: 'aggressive',
      mtfBreakdown: h1Check?.mtfBreakdown,
      trendAlignment: h1Check?.metrics?.trendAlignment,
      directionalTfCount: h1Check?.metrics?.directionalTfCount,
      h1Trend: h1Check?.metrics?.h1Trend,
      liquidityReason: liqGate.reason,
      locationReason: locationGate.reason,
      macroReason: macroGate.reason,
      momentumReason: momentumGate.reason,
      megaPairReason: megaGate.reason,
      signalReasons: [
        `Agg 1m ${scalp.trend1m} · next-3 ${scalp.predictedNext3} · 5m ${scalp.trend5m} · mom ${scalp.momentumPct.toFixed(2)}% · ${scalp.greenCount}/6 green`,
        ...(h1Check?.signalReasons ?? []),
      ],
      indicators: h1Check?.indicators,
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

  await refreshMegaPairVolumeMonitor(universe);

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
