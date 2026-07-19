import { config } from '../config';
import { logger } from '../utils/logger';
import { mapPool } from '../utils/asyncPool';
import { analyzeMarketMTFBySymbol, type TradingStrategy } from './market';
import { analyzeAggressiveScalpBySymbol } from './aggressiveScalpAnalysis';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { fetchHlLiquidUniverse, type HlLiquidUniverse } from './hlLiquidity';
import { refreshMegaPairVolumeMonitor } from './megaPairVolumeMonitor';
import { validateNoAltPumpShort } from './pumpShortGate';
import { classifyCoinTier, needsCautionPath } from './coinTier';
import { validateNotFreshlyPumped } from './freshPumpGate';
import type { Timeframe } from './signalEngine';

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

function profileAnalysisTimeframes(): Timeframe[] {
  return [...config.hyperliquid.directionProfile.analysisTimeframes] as Timeframe[];
}

function isActiveProfileDirection(direction: 'LONG' | 'SHORT'): boolean {
  return direction === config.hyperliquid.directionProfile.primaryDirection;
}

function rulesFor(direction: 'LONG' | 'SHORT') {
  return direction === 'LONG'
    ? config.hyperliquid.directionProfile.long
    : config.hyperliquid.directionProfile.short;
}

function isTrustedProfileCandidate(
  direction: 'LONG' | 'SHORT',
  confidence: number,
  directionalTfCount: number
): boolean {
  const rules = rulesFor(direction);
  return (
    rules.trustMtfScan &&
    confidence >= rules.minConfidence &&
    directionalTfCount >= rules.minDirectionalTfs
  );
}

function passesProfileThresholds(direction: 'LONG' | 'SHORT', opts: {
  confidence: number;
  directionalTfCount: number;
  trendAlignment: number;
  h1Trend?: string;
}): boolean {
  const rules = rulesFor(direction);
  if (opts.confidence < rules.minConfidence) return false;
  if (opts.directionalTfCount < rules.minDirectionalTfs) return false;
  if (opts.trendAlignment < rules.minTrendAlignment) return false;
  if (
    rules.requiredH1Trend &&
    String(opts.h1Trend ?? '').toUpperCase() !== rules.requiredH1Trend
  ) {
    return false;
  }
  return true;
}

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

/** BTC/ETH only — chart direction from MTF (LONG or SHORT, whichever signal engine picks). */
async function scanMajorChartFallback(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number },
  _preloadedUniverse?: HlLiquidUniverse
): Promise<GlobalSignalCandidate | null> {
  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const analysis = await analyzeMarketMTFBySymbol(
      symbol,
      STANDARD_STRATEGY,
      profileAnalysisTimeframes()
    );
    if (!analysis) return null;
    if (analysis.isWeak) return null;
    if (analysis.direction !== 'LONG' && analysis.direction !== 'SHORT') return null;
    if (!isActiveProfileDirection(analysis.direction)) return null;
    if (analysis.confidence < 48) return null;
    const tfs = analysis.metrics?.directionalTfCount ?? 0;
    if (tfs < 1) return null;
    if (
      !passesProfileThresholds(analysis.direction, {
        confidence: analysis.confidence,
        directionalTfCount: tfs,
        trendAlignment: analysis.metrics?.trendAlignment ?? 0,
        h1Trend: analysis.metrics?.h1Trend,
      })
    ) {
      return null;
    }

    return {
      coin,
      symbol,
      direction: analysis.direction,
      confidence: analysis.confidence,
      reason: `${analysis.reason} · major ${analysis.direction} fallback (${analysis.confidence}% / ${tfs} TFs)`,
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

async function scanStandardCoin(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number },
  preloadedUniverse?: HlLiquidUniverse,
  relaxed = false
): Promise<GlobalSignalCandidate | null> {
  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const analysis = await analyzeMarketMTFBySymbol(
      symbol,
      STANDARD_STRATEGY,
      profileAnalysisTimeframes()
    );
    if (!analysis) return null;
    if (analysis.isWeak) return null;
    if (analysis.direction !== 'LONG' && analysis.direction !== 'SHORT') return null;
    if (!isActiveProfileDirection(analysis.direction)) return null;
    const tierInfo = classifyCoinTier(coin, preloadedUniverse);
    const cautious = needsCautionPath(tierInfo.tier) && !relaxed;
    const minConf = cautious
      ? config.hyperliquid.cautiousScan.minSignalConfidence
      : relaxed
        ? Math.max(52, config.hyperliquid.minSignalConfidence - 5)
        : config.hyperliquid.minSignalConfidence;
    if (analysis.confidence < minConf) return null;
    const minTfs = relaxed
      ? 2
      : cautious
        ? config.hyperliquid.cautiousScan.minDirectionalTfs
        : config.hyperliquid.minDirectionalTfs;
    const minAlign = relaxed
      ? 45
      : cautious
        ? config.hyperliquid.cautiousScan.minTrendAlignment
        : config.hyperliquid.minTrendAlignment;
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
    if ((analysis.metrics?.directionalTfCount ?? 0) < minTfs) return null;
    if ((analysis.metrics?.trendAlignment ?? 0) < minAlign) return null;
    const directionalTfCount = analysis.metrics?.directionalTfCount ?? 0;
    const trustedDirection = isTrustedProfileCandidate(
      analysis.direction,
      analysis.confidence,
      directionalTfCount
    );
    if (
      !passesProfileThresholds(analysis.direction, {
        confidence: analysis.confidence,
        directionalTfCount,
        trendAlignment: analysis.metrics?.trendAlignment ?? 0,
        h1Trend: analysis.metrics?.h1Trend,
      })
    ) {
      return null;
    }
    if (
      !relaxed &&
      (
        (analysis.direction === 'LONG' &&
          !trustedDirection &&
          analysis.metrics?.h1Trend === 'DOWN') ||
        (analysis.direction === 'SHORT' &&
          !trustedDirection &&
          (/UP/i.test(String(analysis.metrics?.h1Trend ?? '')) ||
            analysis.metrics?.h1Trend === 'STRONG_UPTREND'))
      )
    ) {
      return null;
    }
    if (analysis.direction === 'SHORT' && !trustedDirection) {
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
      reason: relaxed
        ? `${analysis.reason} · relaxed scan (${analysis.confidence}% / ${analysis.metrics?.directionalTfCount} TFs)`
        : analysis.reason,
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
    if (!isActiveProfileDirection(scalp.direction)) return null;

    if (cautious) {
      const pumpSkip = await validateNotFreshlyPumped({ coin, tier: tierInfo.tier });
      if (!pumpSkip.ok) {
        logger.debug('HL agg scan skip: fresh pump cooldown', { coin, reason: pumpSkip.reason });
        return null;
      }
    }

    const h1Check = await analyzeMarketMTFBySymbol(
      symbol,
      STANDARD_STRATEGY,
      profileAnalysisTimeframes()
    );
    if (h1Check) {
      const directionalTfCount = h1Check.metrics?.directionalTfCount ?? 0;
      const trustedDirection = isTrustedProfileCandidate(
        scalp.direction,
        scalp.confidence,
        directionalTfCount
      );
      if (scalp.direction === 'SHORT') {
        if (!trustedDirection && /UP/i.test(String(h1Check.metrics?.h1Trend ?? ''))) {
          logger.debug('HL agg scan skip: 1h trend UP blocks SHORT', { coin });
          return null;
        }
        if (!trustedDirection) {
          const pumpGate = await validateNoAltPumpShort({ coin, direction: 'SHORT' });
          if (!pumpGate.ok) {
            logger.debug('HL agg scan skip: pump-short gate', { coin, reason: pumpGate.reason });
            return null;
          }
        }
      }
      if (scalp.direction === 'LONG') {
        if (
          !passesProfileThresholds(scalp.direction, {
            confidence: scalp.confidence,
            directionalTfCount,
            trendAlignment: h1Check.metrics?.trendAlignment ?? 0,
            h1Trend: h1Check.metrics?.h1Trend,
          })
        ) {
          logger.debug('HL agg scan skip: LONG below direction-profile thresholds', {
            coin,
            profile: config.hyperliquid.directionProfile.name,
          });
          return null;
        }
        if (!trustedDirection && h1Check.metrics?.h1Trend === 'DOWN') {
          logger.debug('HL agg scan skip: 1h trend DOWN blocks LONG', { coin });
          return null;
        }
      }
    } else if (rulesFor(scalp.direction).requiredH1Trend) {
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

/** Scan all listed HL perps — Standard (MTF) + Aggressive (6×1m → next 3, 5m confirm). */
export async function scanGlobalHlSignals(
  preloadedUniverse?: HlLiquidUniverse
): Promise<GlobalScanResult> {
  const started = Date.now();
  const universe = preloadedUniverse ?? (await fetchHlLiquidUniverse());
  const excludedCoins = new Set(config.hyperliquid.excludedCoins);
  const coins = universe.coins.filter((c) => !excludedCoins.has(c.toUpperCase()));
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
      return scanStandardCoin(coin, liq, universe);
    }),
    mapPool(coins, concurrency, async (coin) => {
      const liq = liqByCoin.get(coin);
      if (!liq) return null;
      return scanAggressiveCoin(coin, liq, universe);
    }),
  ]);

  const standard = standardRaw
    .filter((c): c is GlobalSignalCandidate => c !== null)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd || b.confidence - a.confidence);

  const aggressive = aggressiveRaw
    .filter((c): c is GlobalSignalCandidate => c !== null)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd || b.confidence - a.confidence);

  let finalStandard = standard;
  let aggressiveFiltered = aggressive;

  if (finalStandard.length === 0) {
    const topCoins = coins.slice(0, 10);
    const relaxedRaw = await mapPool(topCoins, concurrency, async (coin) => {
      const liq = liqByCoin.get(coin);
      if (!liq) return null;
      return scanStandardCoin(coin, liq, universe, true);
    });
    finalStandard = relaxedRaw
      .filter((c): c is GlobalSignalCandidate => c !== null)
      .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd || b.confidence - a.confidence);
    if (finalStandard.length > 0) {
      logger.info('Global HL scan — relaxed fallback used', {
        count: finalStandard.length,
        top: finalStandard[0]?.coin,
        direction: finalStandard[0]?.direction,
        conf: finalStandard[0]?.confidence,
      });
    }
  }

  if (finalStandard.length === 0) {
    const majorCoins = ['BTC', 'ETH'].filter((c) => coins.includes(c));
    const majorRaw = await mapPool(majorCoins, 2, async (coin) => {
      const liq = liqByCoin.get(coin);
      if (!liq) return null;
      return scanMajorChartFallback(coin, liq, universe);
    });
    finalStandard = majorRaw
      .filter((c): c is GlobalSignalCandidate => c !== null)
      .sort((a, b) => b.confidence - a.confidence);
    if (finalStandard.length > 0) {
      logger.info('Global HL scan — major chart fallback used', {
        count: finalStandard.length,
        top: finalStandard[0]?.coin,
        direction: finalStandard[0]?.direction,
        conf: finalStandard[0]?.confidence,
      });
    }
  }

  lastGlobalScanResult = { standard: finalStandard, aggressive: aggressiveFiltered };
  lastHlGlobalScanStats = {
    coinsScanned: coins.length,
    liquidUniverse: coins.length,
    standardCandidates: finalStandard.length,
    aggressiveCandidates: aggressiveFiltered.length,
    candidates: finalStandard.length + aggressiveFiltered.length,
    scannedAt: new Date().toISOString(),
  };

  logger.info('Global HL signal scan complete', {
    liquidCoins: coins.length,
    standard: finalStandard.length,
    aggressive: aggressiveFiltered.length,
    topStandard: finalStandard[0]?.coin,
    topAggressive: aggressiveFiltered[0]?.coin,
    ms: Date.now() - started,
  });

  return lastGlobalScanResult;
}

/**
 * Liquid aggressive scalps the Standard bot may borrow when MTF is thin.
 * Keeps Standard from idling while XRP/LINK/etc. print clear scalp direction.
 * Env: HL_STD_BORROW_AGG_MIN_CONF (default 80), HL_STD_BORROW_AGG_MIN_VOL (default $1M).
 */
const STD_BORROW_AGG_MIN_CONF = Number(process.env.HL_STD_BORROW_AGG_MIN_CONF || 80);
const STD_BORROW_AGG_MIN_VOL = Number(process.env.HL_STD_BORROW_AGG_MIN_VOL || 1_000_000);

export function globalSignalsForBotMode(
  scan: GlobalScanResult,
  hlBotStrategy: string | null | undefined
): GlobalSignalCandidate[] {
  const primaryDirection = config.hyperliquid.directionProfile.primaryDirection;
  const standard = scan.standard.filter((candidate) => candidate.direction === primaryDirection);
  const aggressive = scan.aggressive.filter((candidate) => candidate.direction === primaryDirection);

  // Regime profiles are 15m/1h/4h systems. Do not leak 1m/5m aggressive
  // candidates back into Standard (or profit_grabber) while a regime is active.
  if (!config.hyperliquid.directionProfile.useAggressiveScalpSignals) {
    return standard;
  }

  if (hlBotStrategy === 'profit_grabber') return aggressive;

  const seen = new Set(standard.map((c) => c.coin.toUpperCase()));
  const borrowed = aggressive.filter((c) => {
    if (seen.has(c.coin.toUpperCase())) return false;
    if (c.confidence < STD_BORROW_AGG_MIN_CONF) return false;
    if ((c.dayVolumeUsd || 0) < STD_BORROW_AGG_MIN_VOL) return false;
    return true;
  });
  if (borrowed.length === 0) return standard;

  return [...standard, ...borrowed].sort(
    (a, b) => b.dayVolumeUsd - a.dayVolumeUsd || b.confidence - a.confidence
  );
}
