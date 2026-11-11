import { config } from '../config';
import { logger } from '../utils/logger';
import { mapPool } from '../utils/asyncPool';
import { analyzeMarketMTFBySymbol, type TradingStrategy } from './market';
import { analyzeAggressiveScalpBySymbol } from './aggressiveScalpAnalysis';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { signalEngine } from './signalEngine';
import { fetchHlLiquidUniverse, type HlLiquidUniverse } from './hlLiquidity';
import { filterWeekendShortOnly, isWeekendShortOnlyWindow } from './weekendTradingRules';
import { refreshMegaPairVolumeMonitor } from './megaPairVolumeMonitor';
import { validateNoAltPumpShort } from './pumpShortGate';
import { classifyCoinTier, needsCautionPath } from './coinTier';
import { validateNotFreshlyPumped } from './freshPumpGate';

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
  queueable?: boolean;
};

const STANDARD_STRATEGY: TradingStrategy = 'normal';

export type HlGlobalScanStats = {
  coinsScanned: number;
  coinsAnalyzed: number;
  liquidUniverse: number;
  standardCandidates: number;
  aggressiveCandidates: number;
  candidates: number;
  scannedAt: string;
  complete: boolean;
  universeCoins: string[];
};

export type GlobalScanResult = {
  standard: GlobalSignalCandidate[];
  aggressive: GlobalSignalCandidate[];
};

export let lastHlGlobalScanStats: HlGlobalScanStats = {
  coinsScanned: 0,
  coinsAnalyzed: 0,
  liquidUniverse: 0,
  standardCandidates: 0,
  aggressiveCandidates: 0,
  candidates: 0,
  scannedAt: '',
  complete: false,
  universeCoins: [],
};

export let lastGlobalScanResult: GlobalScanResult = { standard: [], aggressive: [] };

async function scanStandardCoin(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number },
  preloadedUniverse?: HlLiquidUniverse
): Promise<GlobalSignalCandidate | null> {
  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const analysis = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (!analysis || analysis.isWeak) return null;
    if (analysis.direction !== 'LONG' && analysis.direction !== 'SHORT') return null;
    const tierInfo = classifyCoinTier(coin, preloadedUniverse);
    const cautious = needsCautionPath(tierInfo.tier);
    const minConf = cautious
      ? config.hyperliquid.cautiousScan.minSignalConfidence
      : config.hyperliquid.minSignalConfidence;
    if (analysis.confidence < minConf) return null;
    if (cautious) {
      const pumpSkip = await validateNotFreshlyPumped({ coin, tier: tierInfo.tier });
      if (!pumpSkip.ok) {
        logger.debug('HL scan skip: fresh pump cooldown', { coin, reason: pumpSkip.reason });
        return null;
      }
      if (
        (analysis.metrics?.directionalTfCount ?? 0) <
        config.hyperliquid.cautiousScan.minDirectionalTfs
      ) {
        return null;
      }
      if (
        (analysis.metrics?.trendAlignment ?? 0) <
        config.hyperliquid.cautiousScan.minTrendAlignment
      ) {
        return null;
      }
    }
    if ((analysis.metrics?.directionalTfCount ?? 0) < config.hyperliquid.minDirectionalTfs) return null;
    if ((analysis.metrics?.trendAlignment ?? 0) < config.hyperliquid.minTrendAlignment) return null;
    if (
      (analysis.direction === 'LONG' && analysis.metrics?.h1Trend === 'DOWN') ||
      (analysis.direction === 'SHORT' &&
        (/UP/i.test(String(analysis.metrics?.h1Trend ?? '')) ||
          analysis.metrics?.h1Trend === 'STRONG_UPTREND'))
    ) {
      return null;
    }
    if (analysis.direction === 'SHORT') {
      const pumpGate = await validateNoAltPumpShort({ coin, direction: 'SHORT' });
      if (!pumpGate.ok) {
        logger.debug('HL scan skip: pump-short gate', { coin, reason: pumpGate.reason });
        return null;
      }
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
      signalReasons: analysis.signalReasons,
      indicators: analysis.indicators,
    };
  } catch {
    return null;
  }
}

async function scanAggressiveCoin(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number },
  preloadedUniverse?: HlLiquidUniverse
): Promise<GlobalSignalCandidate | null> {
  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const scalp = await analyzeAggressiveScalpBySymbol(symbol);
    const tierInfo = classifyCoinTier(coin, preloadedUniverse);
    const cautious = needsCautionPath(tierInfo.tier);
    const minConf = cautious
      ? config.hyperliquid.cautiousScan.minSignalConfidence
      : Math.max(60, config.hyperliquid.minSignalConfidence - 2);
    if (!scalp || scalp.confidence < minConf) return null;

    if (cautious) {
      const pumpSkip = await validateNotFreshlyPumped({ coin, tier: tierInfo.tier });
      if (!pumpSkip.ok) {
        logger.debug('HL agg scan skip: fresh pump cooldown', { coin, reason: pumpSkip.reason });
        return null;
      }
    }

    const h1Check = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (h1Check) {
      if (scalp.direction === 'SHORT') {
        if (/UP/i.test(String(h1Check.metrics?.h1Trend ?? ''))) {
          logger.debug('HL agg scan skip: 1h trend UP blocks SHORT', { coin });
          return null;
        }
        const pumpGate = await validateNoAltPumpShort({ coin, direction: 'SHORT' });
        if (!pumpGate.ok) {
          logger.debug('HL agg scan skip: pump-short gate', { coin, reason: pumpGate.reason });
          return null;
        }
      }
      if (scalp.direction === 'LONG' && h1Check.metrics?.h1Trend === 'DOWN') {
        logger.debug('HL agg scan skip: 1h trend DOWN blocks LONG', { coin });
        return null;
      }
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

const SCAN_CACHE_TTL_MS = 12_000;
const SCAN_COIN_TIMEOUT_MS = 12_000;
const WARM_CONCURRENCY = 6;
let scanInFlight: Promise<GlobalScanResult> | null = null;

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Scan all listed HL perps — Standard (MTF) + Aggressive (6×1m → next 3, 5m confirm). */
export async function scanGlobalHlSignals(
  preloadedUniverse?: HlLiquidUniverse
): Promise<GlobalScanResult> {
  const scannedAtMs = Date.parse(lastHlGlobalScanStats.scannedAt || '');
  const cacheAge = Number.isFinite(scannedAtMs)
    ? Date.now() - scannedAtMs
    : Number.POSITIVE_INFINITY;
  if (cacheAge < SCAN_CACHE_TTL_MS && lastHlGlobalScanStats.scannedAt) {
    return lastGlobalScanResult;
  }
  if (scanInFlight) return scanInFlight;
  scanInFlight = runGlobalHlSignalScan(preloadedUniverse).finally(() => {
    scanInFlight = null;
  });
  return scanInFlight;
}

async function runGlobalHlSignalScan(
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
      coinsAnalyzed: 0,
      liquidUniverse: 0,
      standardCandidates: 0,
      aggressiveCandidates: 0,
      candidates: 0,
      scannedAt: new Date().toISOString(),
      complete: true,
      universeCoins: [],
    };
    lastGlobalScanResult = { standard: [], aggressive: [] };
    return lastGlobalScanResult;
  }

  await refreshMegaPairVolumeMonitor(universe);

  let candlesWarmed = 0;
  await mapPool(coins, WARM_CONCURRENCY, async (coin) => {
    const symbol = hlCoinToBinanceSymbol(coin);
    try {
      await Promise.all(
        (['1m', '5m', '15m', '1h'] as const).map((tf) =>
          signalEngine.fetchCandles(symbol, tf, 100)
        )
      );
      candlesWarmed += 1;
    } catch {
      /* coin still goes through scan; timeout below */
    }
  });

  const standardRaw = await mapPool(coins, concurrency, async (coin) => {
    const liq = liqByCoin.get(coin);
    if (!liq) return null;
    return withTimeout(scanStandardCoin(coin, liq, universe), SCAN_COIN_TIMEOUT_MS, null);
  });
  const aggressiveRaw = await mapPool(coins, concurrency, async (coin) => {
    const liq = liqByCoin.get(coin);
    if (!liq) return null;
    return withTimeout(scanAggressiveCoin(coin, liq, universe), SCAN_COIN_TIMEOUT_MS, null);
  });

  const standard = standardRaw
    .filter((c): c is GlobalSignalCandidate => c !== null)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd || b.confidence - a.confidence);

  const aggressive = aggressiveRaw
    .filter((c): c is GlobalSignalCandidate => c !== null)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd || b.confidence - a.confidence);

  const standardFiltered = filterWeekendShortOnly(standard);
  const aggressiveFiltered = filterWeekendShortOnly(aggressive);

  const complete = candlesWarmed >= Math.ceil(coins.length * 0.8);
  if (
    !complete &&
    lastHlGlobalScanStats.complete &&
    lastGlobalScanResult.standard.length + lastGlobalScanResult.aggressive.length > 0
  ) {
    logger.warn('HL scan incomplete — keeping previous full book', {
      universe: coins.length,
      candlesWarmed,
      ms: Date.now() - started,
    });
    return lastGlobalScanResult;
  }

  lastGlobalScanResult = { standard: standardFiltered, aggressive: aggressiveFiltered };
  lastHlGlobalScanStats = {
    coinsScanned: coins.length,
    coinsAnalyzed: candlesWarmed,
    liquidUniverse: coins.length,
    standardCandidates: standardFiltered.length,
    aggressiveCandidates: aggressiveFiltered.length,
    candidates: standardFiltered.length + aggressiveFiltered.length,
    scannedAt: new Date().toISOString(),
    complete,
    universeCoins: coins,
  };

  logger.info('Global HL signal scan complete', {
    liquidCoins: coins.length,
    candlesWarmed,
    complete,
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

export function boardScanCandidates(scan: GlobalScanResult): GlobalSignalCandidate[] {
  const seen = new Set<string>();
  const out: GlobalSignalCandidate[] = [];
  for (const s of [...scan.standard, ...scan.aggressive]) {
    const key = `${s.coin}:${s.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}
