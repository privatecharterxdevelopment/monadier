import { config } from '../config';
import { logger } from '../utils/logger';
import { mapPool } from '../utils/asyncPool';
import { analyzeMarketMTFBySymbol, type TradingStrategy } from './market';
import { analyzeAggressiveScalpBySymbol } from './aggressiveScalpAnalysis';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { fetchHlLiquidUniverse, type HlLiquidUniverse } from './hlLiquidity';
import { refreshMegaPairVolumeMonitor, isMacroRiskOffEnvironment } from './megaPairVolumeMonitor';
import { validateNoAltPumpShort } from './pumpShortGate';
import { preferLongAfterDumpBoost } from './preferLongAfterDump';
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
};

const STANDARD_STRATEGY: TradingStrategy = 'normal';

/** Match DOWN / STRONG_DOWNTREND / bearish labels from signalEngine + market MTF. */
function isH1DownTrend(h1Trend: string | undefined | null): boolean {
  const t = String(h1Trend ?? '');
  return /DOWN/i.test(t) || /DOWNTREND/i.test(t);
}

/** Match UP / STRONG_UPTREND — keep SHORT blocks symmetric. */
function isH1UpTrend(h1Trend: string | undefined | null): boolean {
  const t = String(h1Trend ?? '');
  return /UP/i.test(t) || /UPTREND/i.test(t);
}

/**
 * Hard counter-trend veto — never open LONG into a 1h downtrend (or SHORT into up).
 * Applies on every scan path including relaxed + major fallback.
 */
export function counterTrendBlocked(
  direction: 'LONG' | 'SHORT',
  h1Trend: string | undefined | null
): boolean {
  if (direction === 'LONG' && isH1DownTrend(h1Trend)) return true;
  if (direction === 'SHORT' && isH1UpTrend(h1Trend)) return true;
  return false;
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
    const analysis = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (!analysis) return null;
    if (analysis.direction !== 'LONG' && analysis.direction !== 'SHORT') return null;
    if (analysis.confidence < 48) return null;
    const tfs = analysis.metrics?.directionalTfCount ?? 0;
    if (tfs < 1) return null;
    if (counterTrendBlocked(analysis.direction, analysis.metrics?.h1Trend)) {
      logger.debug('HL major fallback skip: 1h counter-trend', {
        coin,
        direction: analysis.direction,
        h1Trend: analysis.metrics?.h1Trend,
      });
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
    const analysis = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (!analysis) return null;
    const dir = analysis.direction;
    if (dir !== 'LONG' && dir !== 'SHORT') return null;
    const tierInfo = classifyCoinTier(coin, preloadedUniverse);
    const cautious = needsCautionPath(tierInfo.tier) && !relaxed;
    const minConf = cautious
      ? config.hyperliquid.cautiousScan.minSignalConfidence
      : relaxed
        ? Math.max(52, config.hyperliquid.minSignalConfidence - 5)
        : config.hyperliquid.minSignalConfidence;
    const bouncePeek = await preferLongAfterDumpBoost({
      coin,
      direction: dir,
      confidence: analysis.confidence,
    });
    const bounceBypass =
      bouncePeek.forceLongCandidate && bouncePeek.setup?.ok === true;
    if (analysis.confidence < minConf && !bounceBypass) return null;
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
    if (cautious && !bounceBypass) {
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
    if (
      !bounceBypass &&
      (analysis.metrics?.directionalTfCount ?? 0) < minTfs
    )
      return null;
    if (!bounceBypass && (analysis.metrics?.trendAlignment ?? 0) < minAlign)
      return null;

    const longBoost = bouncePeek;

    // Precision bounce: dump→impulse greens → LONG candidate (even if MTF said HOLD/weak SHORT).
    if (longBoost.forceLongCandidate && longBoost.setup?.ok) {
      const conf = Math.max(
        config.hyperliquid.preferLongAfterDump.impulseCandidateConf,
        longBoost.setup.confidence
      );
      logger.info('HL scan — precision bounce LONG candidate', {
        coin,
        grade: longBoost.setup.grade,
        prior: analysis.direction,
        conf,
      });
      return {
        coin,
        symbol,
        direction: 'LONG' as const,
        confidence: Math.min(100, conf),
        reason: `${longBoost.setup.reason}${relaxed ? ' · relaxed scan' : ''}`,
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
    }

    if (analysis.direction !== 'LONG' && analysis.direction !== 'SHORT') return null;

    // Always enforce — relaxed fallback previously skipped this and opened LONGs in dumps.
    // Exception: confirmed dump→bounce LONG (counter-trend 1h dump is expected into the low).
    if (
      counterTrendBlocked(analysis.direction, analysis.metrics?.h1Trend) &&
      !(longBoost.setup?.ok && analysis.direction === 'LONG')
    ) {
      logger.debug('HL scan skip: 1h counter-trend', {
        coin,
        direction: analysis.direction,
        h1Trend: analysis.metrics?.h1Trend,
        relaxed,
      });
      return null;
    }
    if (analysis.direction === 'SHORT') {
      const pumpGate = await validateNoAltPumpShort({ coin, direction: 'SHORT' });
      if (!pumpGate.ok) {
        logger.debug('HL scan skip: pump-short gate', { coin, reason: pumpGate.reason });
        return null;
      }
    }
    const confidence = Math.min(100, analysis.confidence + longBoost.boostConfidence);
    return {
      coin,
      symbol,
      direction: analysis.direction,
      confidence,
      reason: longBoost.reason
        ? `${relaxed ? `${analysis.reason} · relaxed scan (${analysis.confidence}% / ${analysis.metrics?.directionalTfCount} TFs)` : analysis.reason} · ${longBoost.reason}`
        : relaxed
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

    if (cautious) {
      const pumpSkip = await validateNotFreshlyPumped({ coin, tier: tierInfo.tier });
      if (!pumpSkip.ok) {
        logger.debug('HL agg scan skip: fresh pump cooldown', { coin, reason: pumpSkip.reason });
        return null;
      }
    }

    const h1Check = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (h1Check) {
      if (counterTrendBlocked(scalp.direction, h1Check.metrics?.h1Trend)) {
        logger.debug('HL agg scan skip: 1h counter-trend', {
          coin,
          direction: scalp.direction,
          h1Trend: h1Check.metrics?.h1Trend,
        });
        return null;
      }
      if (scalp.direction === 'SHORT') {
        const pumpGate = await validateNoAltPumpShort({ coin, direction: 'SHORT' });
        if (!pumpGate.ok) {
          logger.debug('HL agg scan skip: pump-short gate', { coin, reason: pumpGate.reason });
          return null;
        }
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

/** Scan all listed HL perps — Standard (MTF) + Aggressive (6×1m → next 3, 5m confirm). */
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

  let aggressiveFiltered = aggressive;
  let finalStandard = standard;

  if (standard.length === 0) {
    const topCoins = coins.slice(0, 12);
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

  const onlyWeakShorts =
    finalStandard.length > 0 &&
    finalStandard.every((c) => c.direction === 'SHORT' && c.confidence < 55);
  const bounceLongs = finalStandard
    .filter((c) => c.direction === 'LONG' && /Bounce LONG/i.test(c.reason))
    .sort((a, b) => b.confidence - a.confidence);

  if (finalStandard.length === 0 || onlyWeakShorts) {
    // Extra pass: top volume coins for precision bounce LONGs when scan is empty/weak-short.
    if (bounceLongs.length === 0) {
      const topVol = coins.slice(0, 15);
      const bounceRaw = await mapPool(topVol, concurrency, async (coin) => {
        const liq = liqByCoin.get(coin);
        if (!liq) return null;
        return scanStandardCoin(coin, liq, universe, true);
      });
      const found = bounceRaw
        .filter((c): c is GlobalSignalCandidate => c !== null)
        .filter((c) => c.direction === 'LONG' && /Bounce LONG/i.test(c.reason))
        .sort((a, b) => b.confidence - a.confidence);
      if (found.length > 0) {
        finalStandard = found;
        logger.info('Global HL scan — precision bounce LONGs (dedicated pass)', {
          count: found.length,
          top: found[0]?.coin,
          conf: found[0]?.confidence,
        });
      }
    } else if (onlyWeakShorts) {
      finalStandard = bounceLongs;
      logger.info('Global HL scan — precision bounce LONGs prefer over weak SHORT fallback', {
        count: bounceLongs.length,
        top: bounceLongs[0]?.coin,
        conf: bounceLongs[0]?.confidence,
      });
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
        .sort((a, b) => {
          if (a.direction !== b.direction) return a.direction === 'LONG' ? -1 : 1;
          return b.confidence - a.confidence;
        });
      if (finalStandard.length > 0) {
        logger.info('Global HL scan — major chart fallback used', {
          count: finalStandard.length,
          top: finalStandard[0]?.coin,
          direction: finalStandard[0]?.direction,
          conf: finalStandard[0]?.confidence,
        });
      }
    }
  }

  const macroRisk = isMacroRiskOffEnvironment();
  if (macroRisk.active) {
    const before = finalStandard.length;
    // Keep precision bounce LONGs — dumps that create risk-off are exactly when bounce setups appear.
    finalStandard = finalStandard.filter(
      (c) => c.direction !== 'LONG' || /Bounce LONG/i.test(c.reason)
    );
    aggressiveFiltered = aggressiveFiltered.filter(
      (c) => c.direction !== 'LONG' || /Bounce LONG/i.test(c.reason)
    );
    if (before > finalStandard.length) {
      logger.info('Global HL scan — LONG candidates removed (macro risk-off)', {
        reason: macroRisk.reason,
        removed: before - finalStandard.length,
        bounceLongsKept: finalStandard.filter((c) => c.direction === 'LONG').length,
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

export function globalSignalsForBotMode(
  scan: GlobalScanResult,
  hlBotStrategy: string | null | undefined
): GlobalSignalCandidate[] {
  if (hlBotStrategy === 'profit_grabber') return scan.aggressive;
  return scan.standard;
}
