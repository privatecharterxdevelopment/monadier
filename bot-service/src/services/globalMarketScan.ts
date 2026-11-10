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
import { btcLeadIsPumping, btcLeadAllowsCautiousShort, refreshBtcLeadMomentum, getBtcTapePhase } from './macroBetaGate';
import { validateNoAltPumpShort } from './pumpShortGate';
import { classifyCoinTier, isMajorFillCoin, MAJOR_FILL_COINS, needsCautionPath } from './coinTier';
import { validateNotFreshlyPumped } from './freshPumpGate';
import { resolvePeakAwareDirection } from './peakShortLiquidity';
import { validateProfileEntryTrend } from './profileEntryTrendGate';
import {
  evaluateBearLongOpportunity,
  votesFromTfMap,
  type BearLongClassification,
} from './bearReversalLong';
import { isLongAllowedCoin } from './longAllowlist';
import { isBotTradeCoin } from './botTradeUniverse';
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
  longClass?: BearLongClassification['class'];
  reversalCode?: string | null;
  tfVotes?: Partial<Record<string, string>>;
  /**
   * false = SCAN/UI only. Must not enter the open queue (counter-trend LONG
   * under SHORT-primary, unless it beat a real SHORT or is a strong lone bounce).
   */
  queueable?: boolean;
};

const STANDARD_STRATEGY: TradingStrategy = 'normal';

/**
 * When both sides print, prefer the active regime's primary direction unless
 * the other side is clearly stronger. SHORT-primary stays preferred (edge 18) —
 * LONGs only steal the slot when meaningfully competitive (was 30 = starved).
 *
 * SCAN still keeps both sides for badges. Opens use `queueable` so a display
 * LONG cannot occupy the slot / wait-loop while SHORTs are available.
 */
/**
 * Bear LONG may occupy the open queue only as TREND_LONG or confirmed REVERSAL_LONG.
 * Relief bounces / dump waits must not steal the SHORT slot then die at the open gate.
 */
export function isOpenableLongCandidate(c: GlobalSignalCandidate | null): boolean {
  if (!c || c.direction !== 'LONG') return false;
  if (config.hyperliquid.directionProfile.name !== 'bear_market') return true;
  return c.longClass === 'TREND_LONG' || c.longClass === 'REVERSAL_LONG';
}

function pickPreferredCandidate(
  longC: GlobalSignalCandidate | null,
  shortC: GlobalSignalCandidate | null
): GlobalSignalCandidate | null {
  const profile = config.hyperliquid.directionProfile;
  // ROOT: bear_market (allowLongOpens=false) never returns a LONG pick.
  if (!profile.allowLongOpens) {
    return shortC;
  }
  // ROOT: bull_market (allowShortOpens=false) never returns a SHORT pick.
  if (!profile.allowShortOpens) {
    return longC;
  }

  if (longC && !isOpenableLongCandidate(longC)) {
    longC = null;
  }

  const btcInflow = btcLeadIsPumping();
  const btcShort = btcLeadAllowsCautiousShort();
  if (!btcShort.ok) {
    shortC = null;
  }

  if (longC && shortC) {
    const shortH1Down = h1TrendMatchesRequired(shortC.h1Trend ?? undefined, 'DOWN');
    const longH1Up = h1TrendMatchesRequired(longC.h1Trend ?? undefined, 'UP');
    // Per-coin analysis — not a global SHORT-or-LONG lock.
    if (btcInflow && longH1Up && !shortH1Down) return longC;
    if (longH1Up && !shortH1Down) return longC;
    if (shortH1Down && !longH1Up) return shortC;
    if (Math.abs((longC.confidence ?? 0) - (shortC.confidence ?? 0)) >= 5) {
      return (longC.confidence ?? 0) >= (shortC.confidence ?? 0) ? longC : shortC;
    }
    return (shortC.confidence ?? 0) >= (longC.confidence ?? 0) ? shortC : longC;
  }

  if (longC && !shortC && profile.primaryDirection === 'SHORT') {
    if (
      !h1TrendMatchesRequired(longC.h1Trend ?? undefined, 'UP') &&
      longC.confidence < 62
    ) {
      return null;
    }
    return longC;
  }

  // Lone LONG under bull still needs UP 1h — unless BTC is still inflowing.
  if (longC && !shortC && profile.primaryDirection === 'LONG') {
    if (
      !btcInflow &&
      !h1TrendMatchesRequired(longC.h1Trend ?? undefined, 'UP')
    ) {
      return null;
    }
  }

  return longC ?? shortC;
}

/** Opens only. Display LONGs stay on the board with queueable=false. */
export function isScanQueueable(
  candidate: GlobalSignalCandidate,
  preferred: GlobalSignalCandidate | null,
  shortC: GlobalSignalCandidate | null
): boolean {
  const profile = config.hyperliquid.directionProfile;
  const primary = profile.primaryDirection;
  // One side per coin — the side pickPreferredCandidate chose from MTF.
  // Mixed books come from different coins, not LONG+SHORT on the same pair.
  if (
    preferred &&
    preferred.coin === candidate.coin &&
    preferred.direction === candidate.direction
  ) {
    if (candidate.direction === 'LONG' && !isOpenableLongCandidate(candidate)) {
      return false;
    }
    return true;
  }
  if (candidate.direction === primary && (!preferred || preferred.coin !== candidate.coin)) {
    return true;
  }
  return false;
}

function withQueueFlag(
  candidate: GlobalSignalCandidate,
  preferred: GlobalSignalCandidate | null,
  shortC: GlobalSignalCandidate | null
): GlobalSignalCandidate {
  return {
    ...candidate,
    queueable: isScanQueueable(candidate, preferred, shortC),
  };
}

/**
 * Regime hard gates. Peak→SHORT is NOT a bypass when allowShortOpens=false.
 */
function isActiveProfileDirection(
  direction: 'LONG' | 'SHORT',
  _peakLiquidityGrab = false
): boolean {
  const profile = config.hyperliquid.directionProfile;
  if (direction === 'LONG' && !profile.allowLongOpens) return false;
  if (direction === 'SHORT' && !profile.allowShortOpens) return false;
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

/** SHORT may fire while 1h is SIDEWAYS; only a 1h uptrend is a hard veto. */
export function h1AllowsShort(h1Trend: string | undefined): boolean {
  const raw = String(h1Trend ?? '').toUpperCase();
  if (!raw) return false;
  return !h1TrendMatchesRequired(raw, 'UP');
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
  const skipCoinH1Up =
    direction === 'LONG' &&
    rules.requiredH1Trend === 'UP' &&
    btcLeadIsPumping();
  if (direction === 'SHORT' && rules.requiredH1Trend === 'DOWN') {
    if (!h1AllowsShort(opts.h1Trend)) return false;
    return true;
  }
  if (!skipCoinH1Up && !h1TrendMatchesRequired(opts.h1Trend, rules.requiredH1Trend)) {
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

/** Liquid majors — looser MTF bar so empty slots fill these instead of alt wicks. */
async function scanMajorChartFallback(
  coin: string,
  liq: { dayVolumeUsd: number; openInterestUsd: number },
  _preloadedUniverse?: HlLiquidUniverse
): Promise<GlobalSignalCandidate | null> {
  const [longC, shortC] = await Promise.all([
    scanStandardCoinDirection(coin, liq, _preloadedUniverse, true, 'LONG', true),
    scanStandardCoinDirection(coin, liq, _preloadedUniverse, true, 'SHORT', true),
  ]);
  // pickPreferredCandidate drops lone LONGs without a strict 1h UP. Empty
  // slots still take the major MTF print as long as 1h is not dumping.
  let pick = pickPreferredCandidate(longC, shortC);
  if (
    !pick &&
    longC &&
    isOpenableLongCandidate(longC) &&
    !h1TrendMatchesRequired(longC.h1Trend ?? undefined, 'DOWN')
  ) {
    pick = longC;
  }
  if (!pick) pick = shortC;
  if (!pick) return null;
  const majorConfFloor = pick.direction === 'SHORT' ? 52 : 58;
  if (pick.confidence < majorConfFloor) return null;
  const majorTfFloor =
    pick.direction === 'SHORT' ||
    (pick.direction === 'LONG' && pick.longClass === 'REVERSAL_LONG')
      ? 2
      : 3;
  if ((pick.directionalTfCount ?? 0) < majorTfFloor) return null;
  const tagged = withQueueFlag(pick, pick, shortC);
  return {
    ...tagged,
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
): Promise<GlobalSignalCandidate[]> {
  const [longC, shortC] = await Promise.all([
    scanStandardCoinDirection(coin, liq, preloadedUniverse, relaxed, 'LONG'),
    scanStandardCoinDirection(coin, liq, preloadedUniverse, relaxed, 'SHORT'),
  ]);
  const both = [longC, shortC].filter((c): c is GlobalSignalCandidate => c !== null);
  const preferred = pickPreferredCandidate(longC, shortC);
  const tagged = both.map((c) => withQueueFlag(c, preferred, shortC));
  if (tagged.length <= 1) return tagged;
  const prefTagged = tagged.find(
    (c) =>
      preferred &&
      c.coin === preferred.coin &&
      c.direction === preferred.direction
  );
  if (!prefTagged) return tagged;
  return [prefTagged, ...tagged.filter((c) => c !== prefTagged)];
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
  wantedDirection: 'LONG' | 'SHORT',
  majorFill = false
): Promise<GlobalSignalCandidate | null> {
  // LONG allowlist: bull = all coins; bear/default = majors only (see longAllowlist).
  // ROOT: bear_market allowLongOpens=false → never analyze LONG at all.
  if (wantedDirection === 'LONG') {
    if (!config.hyperliquid.directionProfile.allowLongOpens) {
      return null;
    }
    if (!isLongAllowedCoin(coin)) {
      return null;
    }
  }
  // ROOT: bull_market allowShortOpens=false → never analyze SHORT at all.
  if (wantedDirection === 'SHORT' && !config.hyperliquid.directionProfile.allowShortOpens) {
    return null;
  }
  if (wantedDirection === 'SHORT' && btcLeadIsPumping()) {
    return null;
  }
  if (wantedDirection === 'SHORT' && !btcLeadAllowsCautiousShort().ok) {
    return null;
  }
  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const tfs = (
      wantedDirection === 'LONG'
        ? (majorFill
            ? (['15m', '1h'] as Timeframe[])
            : analysisTimeframesForDirection('LONG'))
        : analysisTimeframesForDirection(wantedDirection)
    ) as Timeframe[];
    const analysis = await analyzeMarketMTFBySymbol(symbol, STANDARD_STRATEGY, tfs);
    if (!analysis) return null;
    // Strategy isWeak uses 60%. Aug 21 profile LONGs fire at 52% / 2 TFs.
    if (analysis.isWeak && (analysis.metrics?.directionalTfCount ?? 0) < 2) {
      return null;
    }
    if (analysis.direction !== wantedDirection) return null;

    const peak = await resolvePeakAwareDirection(coin, analysis.direction);
    const direction = peak.direction;
    const peakLiquidityGrab = peak.peakLiquidityGrab;
    // Peak may flip LONG→SHORT; kill that when shorts are hard-disabled.
    if (wantedDirection === 'SHORT' && direction !== 'SHORT') return null;
    if (wantedDirection === 'LONG' && direction === 'SHORT') {
      if (btcLeadIsPumping()) return null;
      if (!config.hyperliquid.directionProfile.allowShortOpens || !peakLiquidityGrab) {
        return null;
      }
    }
    if (!isActiveProfileDirection(direction, peakLiquidityGrab)) return null;

    const tierInfo = classifyCoinTier(coin, preloadedUniverse);
    const cautious = needsCautionPath(tierInfo.tier) && !relaxed;
    const profileMin = rulesFor(wantedDirection).minConfidence;
    const minConf = majorFill
      ? wantedDirection === 'SHORT'
        ? Math.min(profileMin, 52)
        : Math.max(profileMin, 58)
      : cautious
        ? config.hyperliquid.cautiousScan.minSignalConfidence
        : relaxed
          ? Math.min(profileMin, 48)
          : profileMin;
    if (analysis.confidence < minConf) return null;
    const minTfs = majorFill
      ? 2
      : relaxed
      ? 2
      : cautious
        ? config.hyperliquid.cautiousScan.minDirectionalTfs
        : config.hyperliquid.minDirectionalTfs;
    const minAlign = majorFill
      ? wantedDirection === 'SHORT'
        ? 45
        : Math.max(50, rulesFor(wantedDirection).minTrendAlignment)
      : relaxed
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
    const directionalTfCount = analysis.metrics?.directionalTfCount ?? 0;
    const longVotes = votesFromTfMap(analysis.metrics?.tfVotes);
    const bearReversalCtx =
      direction === 'LONG' &&
      config.hyperliquid.directionProfile.name === 'bear_market' &&
      Boolean(config.hyperliquid.directionProfile.reversalLong?.enabled) &&
      Boolean(longVotes.tf15m) &&
      Boolean(longVotes.tf1h);

    let reversal: BearLongClassification | null = null;
    if (bearReversalCtx) {
      reversal = await evaluateBearLongOpportunity({
        coin,
        votes: longVotes,
        confidence: analysis.confidence,
      });
      if (reversal.class === 'OVEREXTENDED_LONG') {
        logger.info('HL scan skip: LONG_OVEREXTENDED', { coin, reason: reversal.reason });
        return null;
      }
      if (
        reversal.class === 'NONE' &&
        (reversal.code === 'LONG_DUMP_CONTINUATION' ||
          reversal.code === 'REVERSAL_STRUCTURE_UNCONFIRMED' ||
          reversal.code === 'REVERSAL_WAITING_RECLAIM' ||
          reversal.code === 'LONG_CONFIDENCE_BELOW_THRESHOLD')
      ) {
        logger.debug('HL scan skip: dump/false reclaim', { coin, reason: reversal.reason });
        return null;
      }
    }

    const reversalOpen = reversal?.class === 'REVERSAL_LONG';
    const tfFloor = reversalOpen ? 2 : minTfs;
    if (directionalTfCount < tfFloor) return null;
    if ((analysis.metrics?.trendAlignment ?? 0) < (reversalOpen ? Math.min(minAlign, 55) : minAlign)) {
      return null;
    }
    const trustedDirection = isTrustedProfileCandidate(
      direction,
      analysis.confidence,
      directionalTfCount,
      peakLiquidityGrab
    );
    if (reversalOpen) {
      const revMin = config.hyperliquid.directionProfile.reversalLong?.minConfidence ?? 62;
      if (analysis.confidence < revMin) return null;
    } else if (majorFill) {
      // Empty-slot majors: trade the MTF print. Do not require 1h UP / 52%.
      // Still refuse LONG into a 1h dump.
      if (
        direction === 'LONG' &&
        h1TrendMatchesRequired(analysis.metrics?.h1Trend, 'DOWN')
      ) {
        return null;
      }
    } else if (
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
    if (!majorFill) {
      const entryTrend = await validateProfileEntryTrend({
        coin,
        direction,
        longClass: reversal?.class,
        skipConfirmCandles: direction === 'SHORT',
        allow15mSideways: direction === 'SHORT',
      });
      if (!entryTrend.ok) {
        logger.debug('HL scan skip: profile 15m entry-trend', { coin, direction, reason: entryTrend.reason });
        return null;
      }
    }
    const dirRules = rulesFor(direction, peakLiquidityGrab);
    if (
      !relaxed &&
      !peakLiquidityGrab &&
      (
        // Only enforce legacy 1h-DOWN block when this side still requires 1h.
        // bear_market LONG uses 15m instead — do not starve counter-trend LONGs.
        (direction === 'LONG' &&
          !trustedDirection &&
          dirRules.requiredH1Trend != null &&
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
      longClass: reversal?.class,
      reversalCode: reversal?.code ?? null,
      tfVotes: analysis.metrics?.tfVotes,
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

    if (direction === 'LONG') {
      if (!config.hyperliquid.directionProfile.allowLongOpens) return null;
      if (!isLongAllowedCoin(coin)) return null;
    }
    if (direction === 'SHORT' && !config.hyperliquid.directionProfile.allowShortOpens) {
      return null;
    }
    if (direction === 'SHORT' && btcLeadIsPumping()) {
      return null;
    }
    if (direction === 'SHORT' && !btcLeadAllowsCautiousShort().ok) {
      return null;
    }

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
        const aggLongTrend = await validateProfileEntryTrend({ coin, direction: 'LONG' });
        if (!aggLongTrend.ok) {
          logger.debug('HL agg scan skip: profile 15m entry-trend', {
            coin,
            reason: aggLongTrend.reason,
          });
          return null;
        }
        if (
          !trustedDirection &&
          rulesFor(direction, peakLiquidityGrab).requiredH1Trend != null &&
          h1Check.metrics?.h1Trend === 'DOWN'
        ) {
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
    } else if (
      rulesFor(direction, peakLiquidityGrab).requiredH1Trend ||
      rulesFor(direction, peakLiquidityGrab).required15mTrend
    ) {
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
  const coins = universe.coins.filter(
    (c) => !excludedCoins.has(c.toUpperCase()) && isBotTradeCoin(c)
  );
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

  await Promise.all([
    refreshMegaPairVolumeMonitor(universe),
    refreshBtcLeadMomentum(),
  ]);
  const tape = getBtcTapePhase();
  logger.info('BTC tape for scan', { phase: tape.phase, reason: tape.reason });

  const [standardRaw, aggressiveRaw] = await Promise.all([
    mapPool(coins, concurrency, async (coin) => {
      const liq = liqByCoin.get(coin);
      if (!liq) return [] as GlobalSignalCandidate[];
      return scanStandardCoin(coin, liq, universe);
    }),
    mapPool(coins, concurrency, async (coin) => {
      const liq = liqByCoin.get(coin);
      if (!liq) return null;
      return scanAggressiveCoin(coin, liq, universe);
    }),
  ]);

  const standard = standardRaw
    .flat()
    .filter((c): c is GlobalSignalCandidate => c != null && Boolean(c.coin))
    .sort((a, b) => b.confidence - a.confidence || b.dayVolumeUsd - a.dayVolumeUsd);

  const aggressive = aggressiveRaw
    .filter((c): c is GlobalSignalCandidate => c !== null)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd || b.confidence - a.confidence);

  let finalStandard = standard;
  let aggressiveFiltered = aggressive;

  // Always keep liquid majors on the book when they print MTF. Memes must not starve the fill.
  {
    const majorCoins = MAJOR_FILL_COINS.filter((c) => coins.includes(c));
    const majorRaw = await mapPool(majorCoins, 3, async (coin) => {
      const liq = liqByCoin.get(coin);
      if (!liq) return null;
      return scanMajorChartFallback(coin, liq, universe);
    });
    const majors = majorRaw.filter((c): c is GlobalSignalCandidate => c !== null);
    const seen = new Set(
      finalStandard.map((c) => `${c.coin.toUpperCase()}:${c.direction}`)
    );
    const injected: GlobalSignalCandidate[] = [];
    for (const row of majors) {
      const key = `${row.coin.toUpperCase()}:${row.direction}`;
      if (seen.has(key)) continue;
      injected.push(row);
      seen.add(key);
    }
    if (injected.length > 0) {
      finalStandard = [...injected, ...finalStandard];
      logger.info('Global HL scan — major chart fallback used', {
        count: injected.length,
        coins: injected.map((c) => `${c.coin} ${c.direction} ${c.confidence}`),
        existingLongs: standard.filter((c) => c.direction === 'LONG').length,
      });
    }
  }

  if (config.hyperliquid.directionProfile.primaryDirection === 'LONG') {
    finalStandard = [...finalStandard].sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === 'LONG' ? -1 : 1;
      const aMaj = isMajorFillCoin(a.coin) ? 1 : 0;
      const bMaj = isMajorFillCoin(b.coin) ? 1 : 0;
      if (aMaj !== bMaj) return bMaj - aMaj;
      return b.dayVolumeUsd - a.dayVolumeUsd || b.confidence - a.confidence;
    });
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
 * When the live profile enables aggressive 1m dump-tape (bear_market), Standard
 * must trade those prints. Extra $1M / 80% floors used to starve Standard:
 * scan already let the coin through, then borrow dropped it (e.g. ALGO $485k
 * 94% SHORT) and the bot idled with skipped cycles.
 */
export function globalSignalsForBotMode(
  scan: GlobalScanResult,
  hlBotStrategy: string | null | undefined
): GlobalSignalCandidate[] {
  const minVol = config.hyperliquid.minDayVolumeUsd;
  const liquidEnough = (c: GlobalSignalCandidate) =>
    minVol <= 0 || (c.dayVolumeUsd || 0) >= minVol;
  const standard = scan.standard
    .filter((c) => c.queueable !== false && liquidEnough(c))
    .sort((a, b) => {
      return b.confidence - a.confidence || b.dayVolumeUsd - a.dayVolumeUsd;
    });
  const aggressive = scan.aggressive.filter(
    (c) => c.queueable !== false && liquidEnough(c)
  );

  // Aggressive 1m/5m scalps are SHORT-stack only. Do not leak into Standard
  // while the active profile disables aggressive scalp signals.
  if (!config.hyperliquid.directionProfile.useAggressiveScalpSignals) {
    return standard;
  }

  if (hlBotStrategy === 'profit_grabber') return aggressive;

  const seen = new Set(standard.map((c) => c.coin.toUpperCase()));
  const borrowed = aggressive.filter((c) => !seen.has(c.coin.toUpperCase()));
  if (borrowed.length === 0) return standard;

  return [...standard, ...borrowed].sort(
    (a, b) => b.confidence - a.confidence || b.dayVolumeUsd - a.dayVolumeUsd
  );
}

/** SCAN badges — keep a few LONGs even when SHORTs dominate the top ranks. */
export function boardScanCandidates(
  scan: GlobalScanResult,
  limit = 16
): GlobalSignalCandidate[] {
  const list = scan.standard;
  const top = list.slice(0, limit);
  const seen = new Set(top.map((c) => `${c.coin.toUpperCase()}:${c.direction}`));
  for (const row of list.filter((c) => c.direction === 'LONG').slice(0, 4)) {
    const key = `${row.coin.toUpperCase()}:${row.direction}`;
    if (seen.has(key)) continue;
    top.push(row);
    seen.add(key);
  }
  return top;
}
