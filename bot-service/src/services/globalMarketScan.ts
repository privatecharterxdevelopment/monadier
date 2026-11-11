import { config } from '../config';
import { logger } from '../utils/logger';
import { mapPool } from '../utils/asyncPool';
import { analyzeMarketMTFBySymbol, type TradingStrategy } from './market';
import { analyzeAggressiveScalpBySymbol } from './aggressiveScalpAnalysis';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { signalEngine } from './signalEngine';
import { isBotTradeCoin } from './botTradeUniverse';
import { fetchHlLiquidUniverse, type HlLiquidUniverse } from './hlLiquidity';
import { filterWeekendShortOnly, isWeekendShortOnlyWindow } from './weekendTradingRules';
import { refreshMegaPairVolumeMonitor } from './megaPairVolumeMonitor';
import { classifyCoinTier, needsCautionPath } from './coinTier';
import { validateNotFreshlyPumped } from './freshPumpGate';
import { isLongAllowedCoin } from './longAllowlist';
import {
  evaluateBearLongOpportunity,
  votesFromTfMap,
  type BearLongVotes,
} from './bearReversalLong';
import type { LongOpportunityClass } from './hlExecutionState';

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
  longClass?: LongOpportunityClass;
  reversalCode?: string | null;
};

export type HlScanSkip = {
  coin: string;
  mode: BotSignalMode;
  reason: string;
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
export let lastHlScanSkips: HlScanSkip[] = [];

function pushSkip(coin: string, mode: BotSignalMode, reason: string): null {
  lastHlScanSkips.push({ coin: coin.toUpperCase(), mode, reason });
  return null;
}

export function h1AllowsShort(h1Trend: string | undefined | null): boolean {
  const t = String(h1Trend ?? '').toUpperCase();
  if (!t) return false;
  if (t.includes('UP')) return false;
  return true;
}

export function isOpenableLongCandidate(
  candidate: Pick<GlobalSignalCandidate, 'direction' | 'longClass' | 'reversalCode'>
): boolean {
  if (candidate.direction !== 'LONG') return false;
  const cls = candidate.longClass;
  if (cls === 'TREND_LONG' || cls === 'REVERSAL_LONG') return true;
  return false;
}

/** SHORT-primary queue: SHORTs always queue; LONGs only if classified and MTF did not pick SHORT. */
export function isScanQueueable(
  candidate: GlobalSignalCandidate,
  mtfPick: GlobalSignalCandidate | null,
  _shortPrimary: GlobalSignalCandidate | null
): boolean {
  if (candidate.direction === 'SHORT') return true;
  if (candidate.direction !== 'LONG') return false;
  if (!isOpenableLongCandidate(candidate)) return false;
  if (mtfPick && mtfPick.direction === 'SHORT' && mtfPick.coin === candidate.coin) {
    return false;
  }
  return true;
}

function votesFromBreakdown(
  breakdown: string | undefined,
  h1Trend: string | undefined
): BearLongVotes {
  const map: Partial<Record<string, string>> = {};
  if (h1Trend) map['1h'] = h1Trend;
  for (const part of String(breakdown ?? '').split('·')) {
    const m = part.trim().match(/^(1m|5m|15m|1h|4h)\s+([A-Za-z_]+)/i);
    if (m) map[m[1].toLowerCase()] = m[2];
  }
  return votesFromTfMap(map);
}

function shortScanBars() {
  const rules = config.hyperliquid.directionProfile.short;
  return {
    minConf: rules.minConfidence ?? config.hyperliquid.minSignalConfidence,
    minAlign: rules.minTrendAlignment ?? config.hyperliquid.minTrendAlignment,
    minTfs: rules.minDirectionalTfs ?? config.hyperliquid.minDirectionalTfs,
  };
}

function longScanBars() {
  const rules = config.hyperliquid.directionProfile.long;
  return {
    minConf: rules.minConfidence ?? config.hyperliquid.minSignalConfidence,
    minAlign: rules.minTrendAlignment ?? config.hyperliquid.minTrendAlignment,
    minTfs: rules.minDirectionalTfs ?? config.hyperliquid.minDirectionalTfs,
  };
}

async function scanStandardCoin(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number },
  preloadedUniverse?: HlLiquidUniverse
): Promise<GlobalSignalCandidate | null> {
  try {
    if (!isBotTradeCoin(coin)) return pushSkip(coin, 'standard', 'not in bot universe');
    const symbol = hlCoinToBinanceSymbol(coin);
    const analysis = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (!analysis) return pushSkip(coin, 'standard', 'no MTF analysis');
    if (analysis.direction !== 'LONG' && analysis.direction !== 'SHORT') {
      return pushSkip(coin, 'standard', `direction ${String(analysis.direction)}`);
    }
    const bars = analysis.direction === 'SHORT' ? shortScanBars() : longScanBars();
    const tierInfo = classifyCoinTier(coin, preloadedUniverse);
    const cautious = needsCautionPath(tierInfo.tier);
    const minConf = cautious
      ? Math.max(bars.minConf, config.hyperliquid.cautiousScan.minSignalConfidence)
      : bars.minConf;
    if (analysis.confidence < minConf) {
      return pushSkip(coin, 'standard', `conf ${analysis.confidence}% < ${minConf}%`);
    }
    if (cautious) {
      const pumpSkip = await validateNotFreshlyPumped({ coin, tier: tierInfo.tier });
      if (!pumpSkip.ok) {
        logger.debug('HL scan skip: fresh pump cooldown', { coin, reason: pumpSkip.reason });
        return pushSkip(coin, 'standard', pumpSkip.reason);
      }
    }
    const tfCount = analysis.metrics?.directionalTfCount ?? 0;
    const align = analysis.metrics?.trendAlignment ?? 0;
    if (tfCount < bars.minTfs) {
      return pushSkip(coin, 'standard', `tfs ${tfCount} < ${bars.minTfs}`);
    }
    if (align < bars.minAlign) {
      return pushSkip(coin, 'standard', `align ${align}% < ${bars.minAlign}%`);
    }
    if (analysis.direction === 'SHORT' && !h1AllowsShort(analysis.metrics?.h1Trend)) {
      return pushSkip(coin, 'standard', `1h ${analysis.metrics?.h1Trend ?? ''} blocks SHORT`);
    }

    let longClass: LongOpportunityClass | undefined;
    let reversalCode: string | null = null;
    if (analysis.direction === 'LONG') {
      if (!isLongAllowedCoin(coin)) {
        return pushSkip(coin, 'standard', 'LONG not on allowlist');
      }
      const cls = await evaluateBearLongOpportunity({
        coin,
        votes: votesFromBreakdown(analysis.mtfBreakdown, analysis.metrics?.h1Trend),
        confidence: analysis.confidence,
      });
      longClass = cls.class;
      reversalCode = cls.code;
      if (!isOpenableLongCandidate({ direction: 'LONG', longClass, reversalCode })) {
        return pushSkip(coin, 'standard', cls.reason || 'LONG not TREND/REVERSAL');
      }
    }

    const candidate: GlobalSignalCandidate = {
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
      longClass,
      reversalCode,
      queueable: true,
    };
    candidate.queueable = isScanQueueable(candidate, candidate, null);
    return candidate;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return pushSkip(coin, 'standard', `scan error ${msg.slice(0, 80)}`);
  }
}

async function scanAggressiveCoin(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number },
  preloadedUniverse?: HlLiquidUniverse
): Promise<GlobalSignalCandidate | null> {
  try {
    if (!isBotTradeCoin(coin)) return null;
    const symbol = hlCoinToBinanceSymbol(coin);
    const scalp = await analyzeAggressiveScalpBySymbol(symbol);
    const tierInfo = classifyCoinTier(coin, preloadedUniverse);
    const cautious = needsCautionPath(tierInfo.tier);
    const minConf = cautious
      ? config.hyperliquid.cautiousScan.minSignalConfidence
      : Math.max(60, config.hyperliquid.minSignalConfidence - 2);
    if (!scalp || scalp.confidence < minConf) {
      return pushSkip(
        coin,
        'aggressive',
        !scalp ? 'no scalp print' : `conf ${scalp.confidence}% < ${minConf}%`
      );
    }

    if (cautious) {
      const pumpSkip = await validateNotFreshlyPumped({ coin, tier: tierInfo.tier });
      if (!pumpSkip.ok) {
        logger.debug('HL agg scan skip: fresh pump cooldown', { coin, reason: pumpSkip.reason });
        return pushSkip(coin, 'aggressive', pumpSkip.reason);
      }
    }

    const h1Check = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY);
    if (h1Check) {
      if (scalp.direction === 'SHORT' && !h1AllowsShort(h1Check.metrics?.h1Trend)) {
        logger.debug('HL agg scan skip: 1h trend UP blocks SHORT', { coin });
        return pushSkip(coin, 'aggressive', `1h ${h1Check.metrics?.h1Trend ?? ''} blocks SHORT`);
      }
      if (scalp.direction === 'LONG' && h1Check.metrics?.h1Trend === 'DOWN') {
        logger.debug('HL agg scan skip: 1h trend DOWN blocks LONG', { coin });
        return pushSkip(coin, 'aggressive', '1h DOWN blocks LONG');
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return pushSkip(coin, 'aggressive', `scan error ${msg.slice(0, 80)}`);
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
  lastHlScanSkips = [];
  const universe = preloadedUniverse ?? (await fetchHlLiquidUniverse());
  const coins = universe.coins.filter((c) => isBotTradeCoin(c));
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
  const minVol = config.hyperliquid.minDayVolumeUsd;
  const liquid = (rows: GlobalSignalCandidate[]) =>
    minVol > 0 ? rows.filter((s) => s.dayVolumeUsd >= minVol) : rows;

  const standard = liquid(scan.standard).filter((s) => {
    if (s.direction === 'SHORT') return true;
    return isOpenableLongCandidate(s);
  });
  const seen = new Set(standard.map((s) => `${s.coin.toUpperCase()}:${s.direction}`));
  const out = [...standard];

  const borrow =
    config.hyperliquid.directionProfile.useAggressiveScalpSignals !== false;
  if (borrow) {
    for (const s of liquid(scan.aggressive)) {
      if (s.direction !== 'SHORT') continue;
      if (!h1AllowsShort(s.h1Trend)) continue;
      const key = `${s.coin.toUpperCase()}:${s.direction}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }

  return out.sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd || b.confidence - a.confidence);
}

export function boardScanCandidates(scan: GlobalScanResult): GlobalSignalCandidate[] {
  const seen = new Set<string>();
  const out: GlobalSignalCandidate[] = [];
  for (const s of [...scan.standard, ...scan.aggressive]) {
    if (!isBotTradeCoin(s.coin)) continue;
    const key = `${s.coin}:${s.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}
