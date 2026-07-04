import { config } from '../config';
import { logger } from '../utils/logger';
import { mapPool } from '../utils/asyncPool';
import { analyzeMarketMTFBySymbol, type TradingStrategy } from './market';
import { analyzeAggressiveScalpBySymbol } from './aggressiveScalpAnalysis';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { fetchHlLiquidUniverse, type HlLiquidUniverse } from './hlLiquidity';
import { sortGlobalSignals } from './marketRegime';
import { validateNoAltPumpShort } from './pumpShortGate';
import { validatePerpMarketContext } from './perpMarketContextGate';
import { classifyCoinTier, isBotExcludedCoin, needsCautionPath } from './coinTier';
import { validateNotFreshlyPumped } from './freshPumpGate';
import { refreshMegaPairVolumeMonitor } from './megaPairVolumeMonitor';
import { validateEntryLocation } from './entryLocationGate';
import { evaluateScanTrendAlignment } from './higherTfAlignment';
import { validateBtcMacroAllowsShort } from './btcMacroShortGate';
import type { PipelineFunnelRecorder } from './pipelineFunnelLog';
import { FUNNEL } from './pipelineFunnelReasons';

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
  /** HL mark at scan time — used for open-time price drift check. */
  scanMarkPx?: number;
  scanAt?: number;
};

const STANDARD_STRATEGY: TradingStrategy = 'normal';

type LiqRow = { dayVolumeUsd: number; openInterestUsd: number; markPx?: number };

function resolveScanMarkPx(
  coin: string,
  liq: LiqRow,
  mids?: Record<string, string | number>
): number | undefined {
  const midKey = mids?.[coin] ?? mids?.[`${coin}-PERP`];
  if (midKey != null) {
    const px = Number(midKey);
    if (px > 0 && Number.isFinite(px)) return px;
  }
  if (liq.markPx && liq.markPx > 0) return liq.markPx;
  return undefined;
}

function withScanReference(
  candidate: GlobalSignalCandidate,
  markPx?: number
): GlobalSignalCandidate {
  return {
    ...candidate,
    scanMarkPx: markPx,
    scanAt: Date.now(),
  };
}

function logScanFail(
  funnel: PipelineFunnelRecorder | undefined,
  coin: string,
  direction: 'LONG' | 'SHORT',
  skipReason: string
): void {
  funnel?.log({
    coin,
    stage: 'scan',
    direction,
    passed: false,
    skip_reason: skipReason,
  });
}

async function validateScanEntryLocation(
  coin: string,
  symbol: string,
  direction: 'LONG' | 'SHORT'
): Promise<{ ok: true; locationReason: string } | { ok: false }> {
  const loc = await validateEntryLocation({ symbol, coin, direction });
  if (!loc.ok) {
    logger.debug('HL scan skip: entry location gate', { coin, direction, reason: loc.reason });
    return { ok: false };
  }
  return { ok: true, locationReason: loc.reason };
}

type MtfScanAnalysis = NonNullable<Awaited<ReturnType<typeof analyzeMarketMTFBySymbol>>>;

/** Trend + pump + location — required for every standard scan candidate (including fallbacks). */
async function applyScanTrendAndPumpGates(opts: {
  coin: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  analysis: MtfScanAnalysis;
  baseConfidence: number;
  minConf: number;
  funnel?: PipelineFunnelRecorder;
}): Promise<
  | {
      ok: true;
      signalConfidence: number;
      resolvedDirection: 'LONG' | 'SHORT';
      macroReason?: string;
      locationReason?: string;
      redirectedFrom?: 'SHORT';
    }
  | { ok: false }
> {
  const { coin, symbol, direction, analysis, baseConfidence, minConf, funnel } = opts;

  if (direction === 'SHORT') {
    const btcMacro = await validateBtcMacroAllowsShort({ coin });
    if (!btcMacro.ok) {
      const longAnalysis = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
      if (longAnalysis && !longAnalysis.isWeak && longAnalysis.direction === 'LONG') {
        logger.info('HL scan redirect SHORT→LONG (BTC macro pump)', {
          coin,
          was: analysis.direction,
          conf: longAnalysis.confidence,
        });
        const redirected = await applyScanTrendAndPumpGates({
          coin,
          symbol,
          direction: 'LONG',
          analysis: longAnalysis,
          baseConfidence: longAnalysis.confidence,
          minConf,
          funnel,
        });
        if (redirected.ok) {
          return { ...redirected, redirectedFrom: 'SHORT' };
        }
      }
      logger.debug('HL scan skip: BTC macro pump', { coin, reason: btcMacro.reason });
      logScanFail(funnel, coin, direction, FUNNEL.scan.btcMacroPump);
      return { ok: false };
    }
  }

  const trend = await evaluateScanTrendAlignment({
    coin,
    direction,
    baseConfidence,
    minConfidence: minConf,
    h1Trend: analysis.metrics?.h1Trend,
    directionalTfCount: analysis.metrics?.directionalTfCount,
  });
  if (!trend.ok) {
    logger.debug('HL scan skip: trend alignment', { coin, reason: trend.reason });
    logScanFail(funnel, coin, direction, trend.skipReason ?? FUNNEL.scan.htfBias);
    return { ok: false };
  }

  if (direction === 'SHORT') {
    const pumpGate = await validateNoAltPumpShort({ coin, direction: 'SHORT' });
    if (!pumpGate.ok) {
      logger.debug('HL scan skip: pump-short gate', { coin, reason: pumpGate.reason });
      logScanFail(funnel, coin, direction, FUNNEL.scan.pumpShort);
      return { ok: false };
    }
    const perp = await validatePerpMarketContext({ coin, direction: 'SHORT' });
    if (!perp.ok) {
      logger.debug('HL scan skip: perp context', { coin, reason: perp.reason });
      logScanFail(funnel, coin, direction, FUNNEL.scan.perpContext);
      return { ok: false };
    }
  }

  const location = await validateScanEntryLocation(coin, symbol, direction);
  if (!location.ok) {
    logScanFail(funnel, coin, direction, FUNNEL.scan.location);
    return { ok: false };
  }

  return {
    ok: true,
    signalConfidence: trend.adjustedConfidence,
    resolvedDirection: direction,
    macroReason: trend.reason,
    locationReason: location.locationReason,
  };
}

export type HlGlobalScanStats = {
  coinsScanned: number;
  liquidUniverse: number;
  standardCandidates: number;
  aggressiveCandidates: number;
  candidates: number;
  scanUniverseCoins: string[];
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
  scanUniverseCoins: [],
  scannedAt: '',
};

export let lastGlobalScanResult: GlobalScanResult = { standard: [], aggressive: [] };

/** API handlers — use last background scan only (never block 30s+ on full universe scan). */
export function getCachedGlobalScanForApi(): GlobalScanResult {
  return lastGlobalScanResult;
}

let cachedGlobalScan: { result: GlobalScanResult; at: number; universeAt: number } | null = null;

function logScanCacheHits(funnel: PipelineFunnelRecorder | undefined, result: GlobalScanResult): void {
  if (!funnel) return;
  for (const c of [...result.standard, ...result.aggressive]) {
    funnel.log({
      coin: c.coin,
      stage: 'scan',
      direction: c.direction,
      passed: true,
      skip_reason: null,
    });
  }
}

async function scanMajorChartFallback(
  coin: string,
  liq: LiqRow,
  mids?: Record<string, string | number>,
  funnel?: PipelineFunnelRecorder
): Promise<GlobalSignalCandidate | null> {
  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const analysis = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (!analysis) return null;
    if (analysis.isWeak) return null;
    if (analysis.direction !== 'LONG' && analysis.direction !== 'SHORT') return null;

    funnel?.log({
      coin,
      stage: 'raw_scan',
      direction: analysis.direction,
      passed: true,
      skip_reason: null,
    });

    if (analysis.confidence < 48) {
      logScanFail(funnel, coin, analysis.direction, FUNNEL.scan.confidence);
      return null;
    }
    const tfs = analysis.metrics?.directionalTfCount ?? 0;
    if (tfs < 1) {
      logScanFail(funnel, coin, analysis.direction, FUNNEL.scan.minTfs);
      return null;
    }

    const gates = await applyScanTrendAndPumpGates({
      coin,
      symbol,
      direction: analysis.direction,
      analysis,
      baseConfidence: analysis.confidence,
      minConf: 48,
      funnel,
    });
    if (!gates.ok) return null;

    const resolvedDirection = gates.resolvedDirection;
    const markPx = resolveScanMarkPx(coin, liq, mids);
    const candidate = withScanReference(
      {
        coin,
        symbol,
        direction: resolvedDirection,
        confidence: gates.signalConfidence,
        reason: gates.redirectedFrom
          ? `${analysis.reason} · redirected ${gates.redirectedFrom}→${resolvedDirection} (BTC pump)`
          : `${analysis.reason} · major ${resolvedDirection} fallback (${gates.signalConfidence}% / ${tfs} TFs)`,
        dayVolumeUsd: liq.dayVolumeUsd,
        openInterestUsd: liq.openInterestUsd,
        botMode: 'standard',
        mtfBreakdown: analysis.mtfBreakdown,
        trendAlignment: analysis.metrics?.trendAlignment,
        directionalTfCount: analysis.metrics?.directionalTfCount,
        h1Trend: analysis.metrics?.h1Trend,
        signalReasons: analysis.signalReasons,
        indicators: analysis.indicators,
        locationReason: gates.locationReason,
        macroReason: gates.macroReason,
      },
      markPx
    );

    funnel?.log({
      coin,
      stage: 'scan',
      direction: analysis.direction,
      passed: true,
      skip_reason: null,
    });
    return candidate;
  } catch {
    return null;
  }
}

async function scanStandardCoin(
  coin: string,
  liq: LiqRow,
  preloadedUniverse?: HlLiquidUniverse,
  relaxed = false,
  funnel?: PipelineFunnelRecorder,
  mids?: Record<string, string | number>
): Promise<GlobalSignalCandidate | null> {
  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const analysis = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (!analysis) {
      funnel?.log({
        coin,
        stage: 'raw_scan',
        direction: 'LONG',
        passed: false,
        skip_reason: FUNNEL.rawScan.noAnalysis,
      });
      return null;
    }
    if (analysis.isWeak) {
      funnel?.log({
        coin,
        stage: 'raw_scan',
        direction: 'LONG',
        passed: false,
        skip_reason: FUNNEL.rawScan.weak,
      });
      return null;
    }
    if (analysis.direction !== 'LONG' && analysis.direction !== 'SHORT') {
      funnel?.log({
        coin,
        stage: 'raw_scan',
        direction: 'LONG',
        passed: false,
        skip_reason: FUNNEL.rawScan.noDirection,
      });
      return null;
    }

    const direction = analysis.direction;
    funnel?.log({
      coin,
      stage: 'raw_scan',
      direction,
      passed: true,
      skip_reason: null,
    });

    const tierInfo = classifyCoinTier(coin, preloadedUniverse);
    const cautious = needsCautionPath(tierInfo.tier);
    const minConf = cautious
      ? config.hyperliquid.cautiousScan.minSignalConfidence
      : relaxed
        ? Math.max(47, config.hyperliquid.minSignalConfidence - 5)
        : config.hyperliquid.minSignalConfidence;

    if (analysis.confidence < minConf) {
      logScanFail(funnel, coin, direction, FUNNEL.scan.confidence);
      return null;
    }

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
        logScanFail(funnel, coin, direction, FUNNEL.scan.freshPump);
        return null;
      }
      if ((analysis.metrics?.directionalTfCount ?? 0) < config.hyperliquid.cautiousScan.minDirectionalTfs) {
        logScanFail(funnel, coin, direction, FUNNEL.scan.minTfs);
        return null;
      }
      if ((analysis.metrics?.trendAlignment ?? 0) < config.hyperliquid.cautiousScan.minTrendAlignment) {
        logScanFail(funnel, coin, direction, FUNNEL.scan.trendAlign);
        return null;
      }
    }

    if ((analysis.metrics?.directionalTfCount ?? 0) < minTfs) {
      logScanFail(funnel, coin, direction, FUNNEL.scan.minTfs);
      return null;
    }
    if ((analysis.metrics?.trendAlignment ?? 0) < minAlign) {
      logScanFail(funnel, coin, direction, FUNNEL.scan.trendAlign);
      return null;
    }

    let signalConfidence = analysis.confidence;
    let macroReason: string | undefined;
    let locationReason: string | undefined;

    const gates = await applyScanTrendAndPumpGates({
      coin,
      symbol,
      direction,
      analysis,
      baseConfidence: analysis.confidence,
      minConf,
      funnel,
    });
    if (!gates.ok) return null;
    signalConfidence = gates.signalConfidence;
    macroReason = gates.macroReason;
    locationReason = gates.locationReason;
    const resolvedDirection = gates.resolvedDirection;

    const markPx = resolveScanMarkPx(coin, liq, mids);
    const candidate = withScanReference(
      {
        coin,
        symbol,
        direction: resolvedDirection,
        confidence: signalConfidence,
        reason: gates.redirectedFrom
          ? `${analysis.reason} · redirected ${gates.redirectedFrom}→${resolvedDirection} (BTC pump)`
          : relaxed
          ? `${analysis.reason} · top-pairs fallback (${signalConfidence}% / ${analysis.metrics?.directionalTfCount} TFs)`
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
        locationReason: locationReason || undefined,
        macroReason,
      },
      markPx
    );

    funnel?.log({
      coin,
      stage: 'scan',
      direction,
      passed: true,
      skip_reason: null,
    });
    return candidate;
  } catch {
    funnel?.log({
      coin,
      stage: 'scan',
      direction: 'LONG',
      passed: false,
      skip_reason: FUNNEL.scan.error,
    });
    return null;
  }
}

async function scanAggressiveCoin(
  coin: string,
  liq: LiqRow,
  preloadedUniverse?: HlLiquidUniverse,
  funnel?: PipelineFunnelRecorder,
  mids?: Record<string, string | number>
): Promise<GlobalSignalCandidate | null> {
  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const scalp = await analyzeAggressiveScalpBySymbol(symbol);
    if (!scalp) {
      return null;
    }

    funnel?.log({
      coin,
      stage: 'raw_scan',
      direction: scalp.direction,
      passed: true,
      skip_reason: null,
    });

    const tierInfo = classifyCoinTier(coin, preloadedUniverse);
    const cautious = needsCautionPath(tierInfo.tier);
    const minConf = cautious
      ? config.hyperliquid.cautiousScan.minSignalConfidence
      : Math.max(60, config.hyperliquid.minSignalConfidence - 2);

    if (scalp.confidence < minConf) {
      logScanFail(funnel, coin, scalp.direction, FUNNEL.scan.confidence);
      return null;
    }

    if (cautious) {
      const pumpSkip = await validateNotFreshlyPumped({ coin, tier: tierInfo.tier });
      if (!pumpSkip.ok) {
        logger.debug('HL agg scan skip: fresh pump cooldown', { coin, reason: pumpSkip.reason });
        logScanFail(funnel, coin, scalp.direction, FUNNEL.scan.freshPump);
        return null;
      }
    }

    const h1Check = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (scalp.direction === 'SHORT') {
      const pumpGate = await validateNoAltPumpShort({ coin, direction: 'SHORT' });
      if (!pumpGate.ok) {
        logger.debug('HL agg scan skip: pump-short gate', { coin, reason: pumpGate.reason });
        logScanFail(funnel, coin, scalp.direction, FUNNEL.scan.pumpShort);
        return null;
      }
    }

    const trend = await evaluateScanTrendAlignment({
      coin,
      direction: scalp.direction,
      baseConfidence: scalp.confidence,
      minConfidence: minConf,
      h1Trend: h1Check?.metrics?.h1Trend,
      directionalTfCount: h1Check?.metrics?.directionalTfCount,
    });
    if (!trend.ok) {
      logger.debug('HL agg scan skip: trend alignment', { coin, reason: trend.reason });
      logScanFail(funnel, coin, scalp.direction, trend.skipReason ?? FUNNEL.scan.htfBias);
      return null;
    }

    const location = await validateScanEntryLocation(coin, symbol, scalp.direction);
    if (!location.ok) {
      logScanFail(funnel, coin, scalp.direction, FUNNEL.scan.location);
      return null;
    }

    const markPx = resolveScanMarkPx(coin, liq, mids);
    const candidate = withScanReference(
      {
        coin,
        symbol,
        direction: scalp.direction,
        confidence: trend.adjustedConfidence,
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
        locationReason: location.locationReason || undefined,
        macroReason: trend.reason,
      },
      markPx
    );

    funnel?.log({
      coin,
      stage: 'scan',
      direction: scalp.direction,
      passed: true,
      skip_reason: null,
    });
    return candidate;
  } catch {
    return null;
  }
}

/** Scan all listed HL perps — Standard (MTF) + Aggressive (6×1m → next 3, 5m confirm). */
export async function scanGlobalHlSignals(
  preloadedUniverse?: HlLiquidUniverse,
  funnel?: PipelineFunnelRecorder,
  mids?: Record<string, string | number>
): Promise<GlobalScanResult> {
  const universe = preloadedUniverse ?? (await fetchHlLiquidUniverse());
  const cacheMs = config.hyperliquid.globalScanCacheMs;
  if (
    cacheMs > 0 &&
    cachedGlobalScan &&
    Date.now() - cachedGlobalScan.at < cacheMs &&
    cachedGlobalScan.universeAt === universe.fetchedAt
  ) {
    logScanCacheHits(funnel, cachedGlobalScan.result);
    return cachedGlobalScan.result;
  }

  const started = Date.now();
  const coins = universe.coins.filter((coin) => {
    if (isBotExcludedCoin(coin)) {
      funnel?.log({
        coin,
        stage: 'scan',
        direction: 'LONG',
        passed: false,
        skip_reason: FUNNEL.scan.excluded,
      });
      return false;
    }
    return true;
  });
  const concurrency = config.scaling.globalScanConcurrency;
  const liqByCoin = new Map(universe.markets.map((m) => [m.coin, m]));

  if (coins.length === 0) {
    lastHlGlobalScanStats = {
      coinsScanned: 0,
      liquidUniverse: 0,
      standardCandidates: 0,
      aggressiveCandidates: 0,
      candidates: 0,
      scanUniverseCoins: [],
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
      return scanStandardCoin(coin, liq, universe, false, funnel, mids);
    }),
    mapPool(coins, concurrency, async (coin) => {
      const liq = liqByCoin.get(coin);
      if (!liq) return null;
      return scanAggressiveCoin(coin, liq, universe, funnel, mids);
    }),
  ]);

  const standard = sortGlobalSignals(
    standardRaw.filter((c): c is GlobalSignalCandidate => c !== null)
  );

  const aggressive = sortGlobalSignals(
    aggressiveRaw.filter((c): c is GlobalSignalCandidate => c !== null)
  );

  let finalStandard = standard;
  const aggressiveFiltered = aggressive;

  if (finalStandard.length === 0) {
    const topCoins = coins.slice(0, 10);
    const relaxedRaw = await mapPool(topCoins, concurrency, async (coin) => {
      const liq = liqByCoin.get(coin);
      if (!liq) return null;
      return scanStandardCoin(coin, liq, universe, true, funnel, mids);
    });
    finalStandard = sortGlobalSignals(
      relaxedRaw.filter((c): c is GlobalSignalCandidate => c !== null)
    );
    if (finalStandard.length > 0) {
      logger.info('Global HL scan — top-pairs fallback used', {
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
      return scanMajorChartFallback(coin, liq, mids, funnel);
    });
    finalStandard = sortGlobalSignals(
      majorRaw.filter((c): c is GlobalSignalCandidate => c !== null)
    );
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
  cachedGlobalScan = {
    result: lastGlobalScanResult,
    at: Date.now(),
    universeAt: universe.fetchedAt,
  };
  lastHlGlobalScanStats = {
    coinsScanned: coins.length,
    liquidUniverse: coins.length,
    standardCandidates: finalStandard.length,
    aggressiveCandidates: aggressiveFiltered.length,
    candidates: finalStandard.length + aggressiveFiltered.length,
    scanUniverseCoins: coins,
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
