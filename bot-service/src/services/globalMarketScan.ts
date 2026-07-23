import { config } from '../config';
import {
  analysisTimeframesForDirection,
  shortAnalysisTimeframes,
} from '../config/directionProfiles';
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
import { resolvePeakAwareDirection } from './peakShortLiquidity';
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
  /** Forced SHORT at pump apex — liquidity grab override. */
  peakLiquidityGrab?: boolean;
};

const STANDARD_STRATEGY: TradingStrategy = 'normal';

/**
 * When both sides print, prefer the active regime's primary direction unless
 * the other side is clearly stronger (+8 conf).
 */
function pickPreferredCandidate(
  longC: GlobalSignalCandidate | null,
  shortC: GlobalSignalCandidate | null
): GlobalSignalCandidate | null {
  if (longC && shortC) {
    const primary = config.hyperliquid.directionProfile.primaryDirection;
    const edge = 8;
    if (primary === 'LONG' && longC.confidence >= shortC.confidence - edge) return longC;
    if (primary === 'SHORT' && shortC.confidence >= longC.confidence - edge) return shortC;
    return longC.confidence >= shortC.confidence ? longC : shortC;
  }
  return longC ?? shortC;
}

/**
 * Both sides stay eligible under every regime. Primary gets that profile's
 * primary-side rules; the opposite side uses COUNTER_TREND_RULES (stricter)
 * via passesProfileThresholds / rulesFor. Peak→SHORT is always allowed.
 */
function isActiveProfileDirection(
  _direction: 'LONG' | 'SHORT',
  _peakLiquidityGrab = false
): boolean {
  return true;
}

function rulesFor(direction: 'LONG' | 'SHORT', _peakLiquidityGrab = false) {
  // Peak shorts use the active profile's SHORT rules (June pack = no relax).
  // Never swap onto shared PRIMARY_RULES — that silently skipped June gates.
  return direction === 'LONG'
    ? config.hyperliquid.directionProfile.long
    : config.hyperliquid.directionProfile.short;
}

function isTrustedProfileCandidate(
  direction: 'LONG' | 'SHORT',
  confidence: number,
  directionalTfCount: number,
  peakLiquidityGrab = false
): boolean {
  const rules = rulesFor(direction, peakLiquidityGrab);
  return (
    rules.trustMtfScan &&
    confidence >= rules.minConfidence &&
    directionalTfCount >= rules.minDirectionalTfs
  );
}

function h1TrendMatchesRequired(
  h1Trend: string | undefined,
  required: 'UP' | 'DOWN' | null
): boolean {
  if (!required) return true;
  const raw = String(h1Trend ?? '').toUpperCase();
  if (!raw) return false;
  if (required === 'UP') {
    return (
      raw === 'UP' ||
      raw.includes('UP') ||
      raw.includes('LONG') ||
      raw === 'STRONG_UPTREND'
    );
  }
  return (
    raw === 'DOWN' ||
    raw.includes('DOWN') ||
    raw.includes('SHORT') ||
    raw === 'STRONG_DOWNTREND'
  );
}

function passesProfileThresholds(direction: 'LONG' | 'SHORT', opts: {
  confidence: number;
  directionalTfCount: number;
  trendAlignment: number;
  h1Trend?: string;
  peakLiquidityGrab?: boolean;
}): boolean {
  const rules = rulesFor(direction, opts.peakLiquidityGrab);
  if (opts.confidence < rules.minConfidence) return false;
  if (opts.directionalTfCount < rules.minDirectionalTfs) return false;
  if (opts.trendAlignment < rules.minTrendAlignment) return false;
  if (!h1TrendMatchesRequired(opts.h1Trend, rules.requiredH1Trend)) return false;
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

/** BTC/ETH only — chart direction from direction-specific MTF stacks. */
async function scanMajorChartFallback(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number },
  _preloadedUniverse?: HlLiquidUniverse
): Promise<GlobalSignalCandidate | null> {
  const [longC, shortC] = await Promise.all([
    scanStandardCoinDirection(coin, liq, _preloadedUniverse, false, 'LONG'),
    scanStandardCoinDirection(coin, liq, _preloadedUniverse, false, 'SHORT'),
  ]);
  const pick = pickPreferredCandidate(longC, shortC);
  if (!pick) return null;
  if (pick.confidence < 48) return null;
  return {
    ...pick,
    reason: pick.peakLiquidityGrab
      ? pick.reason
      : `${pick.reason.replace(/ · major .+$/, '')} · major ${pick.direction} fallback (${pick.confidence}% / ${pick.directionalTfCount ?? 0} TFs)`,
  };
}

async function scanStandardCoin(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number },
  preloadedUniverse?: HlLiquidUniverse,
  relaxed = false
): Promise<GlobalSignalCandidate | null> {
  const [longC, shortC] = await Promise.all([
    scanStandardCoinDirection(coin, liq, preloadedUniverse, relaxed, 'LONG'),
    scanStandardCoinDirection(coin, liq, preloadedUniverse, relaxed, 'SHORT'),
  ]);
  return pickPreferredCandidate(longC, shortC);
}

/**
 * Analyze one side with the hard TF rule:
 *   LONG  → 15m / 1h / (4h)
 *   SHORT → 1m / 5m / 15m / 1h
 */
async function scanStandardCoinDirection(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number },
  preloadedUniverse: HlLiquidUniverse | undefined,
  relaxed: boolean,
  wantedDirection: 'LONG' | 'SHORT'
): Promise<GlobalSignalCandidate | null> {
  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const tfs = analysisTimeframesForDirection(wantedDirection) as Timeframe[];
    const analysis = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY, tfs);
    if (!analysis) return null;
    if (analysis.isWeak) return null;
    if (analysis.direction !== wantedDirection) return null;

    const peak = await resolvePeakAwareDirection(coin, analysis.direction);
    const direction = peak.direction;
    const peakLiquidityGrab = peak.peakLiquidityGrab;
    // Peak may flip LONG→SHORT; only keep that on the LONG analysis path.
    if (wantedDirection === 'SHORT' && direction !== 'SHORT') return null;
    if (wantedDirection === 'LONG' && direction === 'SHORT' && !peakLiquidityGrab) {
      return null;
    }
    if (!isActiveProfileDirection(direction, peakLiquidityGrab)) return null;

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
      direction,
      analysis.confidence,
      directionalTfCount,
      peakLiquidityGrab
    );
    if (
      !passesProfileThresholds(direction, {
        confidence: analysis.confidence,
        directionalTfCount,
        trendAlignment: analysis.metrics?.trendAlignment ?? 0,
        h1Trend: analysis.metrics?.h1Trend,
        peakLiquidityGrab,
      })
    ) {
      return null;
    }
    if (
      !relaxed &&
      !peakLiquidityGrab &&
      (
        (direction === 'LONG' &&
          !trustedDirection &&
          analysis.metrics?.h1Trend === 'DOWN') ||
        (direction === 'SHORT' &&
          !trustedDirection &&
          (/UP/i.test(String(analysis.metrics?.h1Trend ?? '')) ||
            analysis.metrics?.h1Trend === 'STRONG_UPTREND'))
      )
    ) {
      return null;
    }
    if (direction === 'SHORT' && !trustedDirection && !peakLiquidityGrab) {
      const pumpGate = await validateNoAltPumpShort({ coin, direction: 'SHORT' });
      if (!pumpGate.ok) {
        logger.debug('HL scan skip: pump-short gate', { coin, reason: pumpGate.reason });
        return null;
      }
    }
    const tfLabel = tfs.join('/');
    return {
      coin,
      symbol,
      direction,
      confidence: analysis.confidence,
      reason: peakLiquidityGrab
        ? `${analysis.reason} · PEAK→SHORT liquidity grab @$${peak.analysis?.pumpApex.toFixed(2)}`
        : relaxed
          ? `${analysis.reason} · relaxed scan (${analysis.confidence}% / ${directionalTfCount} TFs · ${tfLabel})`
          : `${analysis.reason} · ${wantedDirection} stack ${tfLabel}`,
      dayVolumeUsd: liq.dayVolumeUsd,
      openInterestUsd: liq.openInterestUsd,
      botMode: 'standard',
      mtfBreakdown: analysis.mtfBreakdown,
      trendAlignment: analysis.metrics?.trendAlignment,
      directionalTfCount: analysis.metrics?.directionalTfCount,
      h1Trend: analysis.metrics?.h1Trend,
      signalReasons: analysis.signalReasons,
      indicators: analysis.indicators,
      peakLiquidityGrab,
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
    const peak = await resolvePeakAwareDirection(coin, scalp.direction);
    const direction = peak.direction;
    const peakLiquidityGrab = peak.peakLiquidityGrab;
    if (!isActiveProfileDirection(direction, peakLiquidityGrab)) return null;

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
      // Aggressive is SHORT scalp path — confirm with SHORT stack (incl. 1h).
      (direction === 'LONG'
        ? analysisTimeframesForDirection('LONG')
        : shortAnalysisTimeframes()) as Timeframe[]
    );
    if (h1Check) {
      const directionalTfCount = h1Check.metrics?.directionalTfCount ?? 0;
      const trustedDirection = isTrustedProfileCandidate(
        direction,
        scalp.confidence,
        directionalTfCount,
        peakLiquidityGrab
      );
      if (direction === 'SHORT') {
        if (
          !peakLiquidityGrab &&
          !trustedDirection &&
          /UP/i.test(String(h1Check.metrics?.h1Trend ?? ''))
        ) {
          logger.debug('HL agg scan skip: 1h trend UP blocks SHORT', { coin });
          return null;
        }
        if (!trustedDirection && !peakLiquidityGrab) {
          const pumpGate = await validateNoAltPumpShort({ coin, direction: 'SHORT' });
          if (!pumpGate.ok) {
            logger.debug('HL agg scan skip: pump-short gate', { coin, reason: pumpGate.reason });
            return null;
          }
        }
      }
      if (direction === 'LONG') {
        if (
          !passesProfileThresholds(direction, {
            confidence: scalp.confidence,
            directionalTfCount,
            trendAlignment: h1Check.metrics?.trendAlignment ?? 0,
            h1Trend: h1Check.metrics?.h1Trend,
            peakLiquidityGrab,
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
      } else if (
        !passesProfileThresholds(direction, {
          confidence: scalp.confidence,
          directionalTfCount,
          trendAlignment: h1Check.metrics?.trendAlignment ?? 0,
          h1Trend: h1Check.metrics?.h1Trend,
          peakLiquidityGrab,
        })
      ) {
        return null;
      }
    } else if (rulesFor(direction, peakLiquidityGrab).requiredH1Trend) {
      return null;
    }

    return {
      coin,
      symbol,
      direction,
      confidence: scalp.confidence,
      reason: peakLiquidityGrab
        ? `${scalp.reason} · PEAK→SHORT liquidity grab @$${peak.analysis?.pumpApex.toFixed(2)}`
        : scalp.reason,
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
      peakLiquidityGrab,
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
  // Both sides stay — counter-trend setups already cleared profile thresholds in scan.
  const standard = scan.standard;
  const aggressive = scan.aggressive;

  // Aggressive 1m/5m scalps are SHORT-stack only. Do not leak into Standard
  // while the active profile disables aggressive scalp signals.
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
