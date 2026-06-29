/**
 * Live thesis check for open HL positions.
 * Closes on signal/macro reversal; defers mechanical stop_loss while thesis intact.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { evaluateMacroBetaAlignment, type MacroBetaResult } from './macroBetaGate';
import { analyzeMarketMTFBySymbol } from './market';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { signalEngine } from './signalEngine';
import { detectLiquiditySweep } from './liquiditySweepGate';
import { validateMegaPairVolumeForDirection } from './megaPairVolumeMonitor';

export type PositionThesisVerdict = {
  thesisIntact: boolean;
  macroAgainst: boolean;
  signalAgainst: boolean;
  signalDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  signalConfidence: number;
  reason: string;
  macro: MacroBetaResult;
  mtfSummary: string;
};

const thesisCache = new Map<string, { at: number; verdict: PositionThesisVerdict }>();

function cacheKey(coin: string, direction: 'LONG' | 'SHORT'): string {
  return `${coin.toUpperCase()}:${direction}`;
}

export async function evaluatePositionThesis(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  forceRefresh?: boolean;
}): Promise<PositionThesisVerdict> {
  const coin = opts.coin.toUpperCase();
  const key = cacheKey(coin, opts.direction);
  const ttl = config.hyperliquid.thesisCheckCacheMs;
  const cached = thesisCache.get(key);
  if (!opts.forceRefresh && cached && Date.now() - cached.at < ttl) {
    return cached.verdict;
  }

  const macro = await evaluateMacroBetaAlignment({ coin, direction: opts.direction });
  const macroAgainst = !macro.ok;

  let signalAgainst = false;
  let signalDirection: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  let signalConfidence = 0;
  let mtfSummary = 'MTF unavailable';

  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const analysis = await analyzeMarketMTFBySymbol(symbol, 'normal');
    if (analysis) {
      signalDirection = analysis.direction;
      signalConfidence = analysis.confidence;
      mtfSummary =
        analysis.mtfBreakdown ??
        `${analysis.direction} ${analysis.confidence}% · align ${analysis.metrics?.trendAlignment ?? '?'}% · 1h ${analysis.metrics?.h1Trend ?? '?'}`;
      const minConf = config.hyperliquid.minSignalConfidence;
      if (
        analysis.direction !== opts.direction &&
        analysis.confidence >= minConf &&
        !analysis.isWeak
      ) {
        signalAgainst = true;
      }
    }
  } catch {
    /* keep defaults — fail open on thesis (don't force close on data error) */
  }

  const thesisIntact = !macroAgainst && !signalAgainst;

  const parts: string[] = [];
  if (macroAgainst) parts.push(`Macro vs ${opts.direction}: ${macro.blockers.join('; ') || macro.reason}`);
  if (signalAgainst) {
    parts.push(`MTF flipped ${signalDirection} ${signalConfidence}% (was ${opts.direction})`);
  }
  if (thesisIntact) {
    parts.push(`Thesis intact — ${opts.direction} · ${mtfSummary}`);
  }

  const verdict: PositionThesisVerdict = {
    thesisIntact,
    macroAgainst,
    signalAgainst,
    signalDirection,
    signalConfidence,
    reason: parts.join(' ‖ '),
    macro,
    mtfSummary,
  };

  thesisCache.set(key, { at: Date.now(), verdict });
  return verdict;
}

export function buildCloseReasonDoc(opts: {
  closeCode: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  pnlUsd: number;
  pnlPct: number;
  slPct: number;
  peakUsd: number;
  thesis?: PositionThesisVerdict;
}): string {
  const lines: string[] = [
    `${opts.closeCode.replace(/_/g, ' ').toUpperCase()} · ${opts.direction} ${opts.coin}`,
    `PnL $${opts.pnlUsd.toFixed(4)} (${opts.pnlPct.toFixed(2)}% on margin) · peak $${opts.peakUsd.toFixed(4)} · SL ${opts.slPct > 0 ? `${opts.slPct}%` : 'off'}`,
  ];
  if (opts.thesis) {
    lines.push(opts.thesis.reason);
    if (opts.thesis.macroAgainst) {
      lines.push(`Macro: ${opts.thesis.macro.reason}`);
    }
    lines.push(`Live MTF: ${opts.thesis.mtfSummary}`);
  }
  return lines.join(' ‖ ');
}

export function shouldForceLossCap(pnlPct: number, slPct: number, pnlUsd: number): boolean {
  const capUsd = computeMaxLossCapUsd(999999, slPct); // pct-only leg
  if (pnlUsd <= -capUsd) return true;
  const mult = config.hyperliquid.thesisMaxLossSlMultiple;
  return slPct > 0 && pnlPct <= -slPct * mult;
}

/** User SL% on margin; optional absolute USD ceiling when thesisMaxLossUsd > 0. */
export function computeMaxLossCapUsd(collateralUsd: number, slPct: number): number {
  const absCap = config.hyperliquid.thesisMaxLossUsd;
  const fromSl =
    slPct > 0 && collateralUsd > 0 ? collateralUsd * (slPct / 100) : 0;
  if (absCap <= 0) return fromSl > 0 ? fromSl : 0;
  if (fromSl <= 0) return absCap;
  return Math.min(fromSl, absCap);
}

/** Bot-enforced SL — caps wide user settings and applies default when SL is off. */
export function effectiveStopLossPct(userSlPct: number): number {
  const cfg = config.hyperliquid;
  const ceiling = cfg.maxAutoStopLossPct;
  if (userSlPct <= 0) {
    const fallback = cfg.defaultStopLossPercent;
    return fallback > 0 ? Math.min(fallback, ceiling) : ceiling;
  }
  return Math.min(userSlPct, ceiling);
}

/** Hard USD loss cap per position — min(collateral SL, % of account). */
export function perPositionEmergencyLossUsd(
  accountBalanceUsd: number,
  collateralUsd: number,
  userSlPct: number
): number {
  const cfg = config.hyperliquid;
  const fromSl = computeMaxLossCapUsd(collateralUsd, effectiveStopLossPct(userSlPct));
  const fromAccount = Math.max(
    cfg.emergencyMaxLossUsdFloor,
    accountBalanceUsd * cfg.emergencyMaxLossAccountPct
  );
  const envCap = cfg.thesisEmergencyMaxLossUsd;
  const caps = [fromSl, fromAccount];
  if (envCap > 0) caps.push(envCap);
  return Math.min(...caps.filter((n) => n > 0));
}

export function shouldHardLossClose(
  pnlUsd: number,
  collateralUsd: number,
  slPct: number
): boolean {
  if (pnlUsd >= 0) return false;
  const cap = computeMaxLossCapUsd(collateralUsd, effectiveStopLossPct(slPct));
  return cap > 0 && pnlUsd <= -cap;
}

export function shouldEmergencyLossClose(
  pnlUsd: number,
  accountBalanceUsd: number,
  collateralUsd: number,
  userSlPct: number
): boolean {
  if (pnlUsd >= 0) return false;
  const cap = perPositionEmergencyLossUsd(accountBalanceUsd, collateralUsd, userSlPct);
  return cap > 0 && pnlUsd <= -cap;
}

export function logThesisDeferStopLoss(
  user: string,
  coin: string,
  direction: 'LONG' | 'SHORT',
  pnlPct: number,
  sl: number,
  thesis: PositionThesisVerdict
): void {
  logger.info('HL stop_loss deferred — thesis intact', {
    user: user.slice(0, 10),
    coin,
    direction,
    pnlPct: pnlPct.toFixed(2),
    sl,
    thesis: thesis.reason.slice(0, 200),
  });
}

export type ProfitRunBias = 'strong_run' | 'run' | 'neutral' | 'fade' | 'reversal';

export type ProfitRunAnalysis = {
  bias: ProfitRunBias;
  thesis: PositionThesisVerdict;
  volumeRatio: number;
  volumeNote: string;
  profitHoldSec: number;
  analyzePhase: boolean;
  trailReady: boolean;
  recommendation: string;
  logLine: string;
};

function deriveProfitRunBias(
  thesis: PositionThesisVerdict,
  volumeRatio: number
): ProfitRunBias {
  if (thesis.signalAgainst || thesis.macroAgainst) {
    return thesis.signalAgainst && thesis.macroAgainst ? 'reversal' : 'fade';
  }
  if (thesis.thesisIntact && volumeRatio >= 1.35) return 'strong_run';
  if (thesis.thesisIntact) return 'run';
  return 'neutral';
}

/** Widen trail on strong runs, tighten when thesis fades. */
export function trailDistanceMultFromBias(bias: ProfitRunBias): number {
  const strong = config.hyperliquid.profitTrailStrongRunMult;
  if (bias === 'strong_run') return strong;
  if (bias === 'run') return Math.max(1.12, strong * 0.72);
  if (bias === 'reversal') return 0.92;
  if (bias === 'fade') return 1;
  return 1;
}

/** Live read while in profit — macro, MTF, volume before trail SL arms. */
export async function evaluateProfitRunAnalysis(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  profitHoldMs: number;
  pnlUsd: number;
}): Promise<ProfitRunAnalysis> {
  const minHold = config.hyperliquid.profitMinHoldBeforeExitMs;
  const profitHoldSec = Math.round(opts.profitHoldMs / 1000);
  const analyzePhase = opts.profitHoldMs < minHold;
  const trailReady = opts.profitHoldMs >= minHold && opts.pnlUsd > 0;

  const thesis = await evaluatePositionThesis({
    coin: opts.coin,
    direction: opts.direction,
  });

  let volumeRatio = 1;
  let volumeNote = 'vol n/a';
  try {
    const symbol = hlCoinToBinanceSymbol(opts.coin);
    const c5m = await signalEngine.fetchCandles(symbol, '5m', 24);
    const sweep = detectLiquiditySweep(c5m);
    volumeRatio = sweep.volumeRatio;
    volumeNote = sweep.volumeOk
      ? `vol ${volumeRatio.toFixed(2)}x${sweep.bias ? ` · sweep ${sweep.bias}` : ''}`
      : `vol weak ${volumeRatio.toFixed(2)}x`;
  } catch {
    /* optional */
  }

  const bias = deriveProfitRunBias(thesis, volumeRatio);
  const recommendation =
    analyzePhase
      ? bias === 'reversal' || bias === 'fade'
        ? 'watch — momentum fading during analyze window'
        : 'hold — analyzing direction (no trail SL yet)'
      : trailReady
        ? bias === 'strong_run' || bias === 'run'
          ? 'trail SL in profit — let winner run'
          : bias === 'fade' || bias === 'reversal'
            ? 'trail armed — tighten on weakness'
            : 'trail SL armed at breakeven+'
        : 'flat';

  const phaseLabel = analyzePhase
    ? `analyze ${profitHoldSec}s/${Math.round(minHold / 1000)}s`
    : 'trail phase';

  const logLine = [
    `${phaseLabel}`,
    `${opts.direction} ${opts.coin} +$${opts.pnlUsd.toFixed(3)}`,
    thesis.mtfSummary,
    volumeNote,
    `bias ${bias}`,
  ].join(' · ');

  return {
    bias,
    thesis,
    volumeRatio,
    volumeNote,
    profitHoldSec,
    analyzePhase,
    trailReady,
    recommendation,
    logLine,
  };
}

const profitAnalyzeLogAt = new Map<string, number>();

export function logProfitRunAnalysis(
  user: string,
  coin: string,
  analysis: ProfitRunAnalysis,
  force = false
): void {
  const key = `${user.toLowerCase()}:${coin.toUpperCase()}`;
  const now = Date.now();
  const last = profitAnalyzeLogAt.get(key) ?? 0;
  const interval = analysis.analyzePhase ? 20_000 : 45_000;
  if (!force && now - last < interval) return;
  profitAnalyzeLogAt.set(key, now);

  logger.info('HL profit run analysis', {
    user: user.slice(0, 10),
    coin,
    phase: analysis.analyzePhase ? 'analyze' : 'trail',
    profitHoldSec: analysis.profitHoldSec,
    bias: analysis.bias,
    recommendation: analysis.recommendation,
    detail: analysis.logLine,
  });
}

export function clearProfitAnalyzeLog(user: string, coin: string): void {
  profitAnalyzeLogAt.delete(`${user.toLowerCase()}:${coin.toUpperCase()}`);
}

export type TrailPullbackVerdict = {
  deferClose: boolean;
  reason: string;
  sweepBias: 'LONG' | 'SHORT' | null;
  volumeRatio: number;
  volumeOk: boolean;
  runBias: ProfitRunBias;
  thesis: PositionThesisVerdict;
  megaOk: boolean;
  logLine: string;
};

/** At trail floor touch — sweep + volume + MTF decide rebound hold vs profit_lock close. */
export async function evaluateTrailPullbackAnalysis(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  pnlUsd: number;
  floorUsd: number;
  peakUsd: number;
}): Promise<TrailPullbackVerdict> {
  const { coin, direction, pnlUsd, floorUsd, peakUsd } = opts;

  const thesis = await evaluatePositionThesis({
    coin,
    direction,
    forceRefresh: true,
  });

  let sweepBias: 'LONG' | 'SHORT' | null = null;
  let volumeRatio = 1;
  let volumeOk = false;
  let sweepReason = 'vol n/a';

  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const c5m = await signalEngine.fetchCandles(symbol, '5m', 30);
    const sweep = detectLiquiditySweep(c5m);
    sweepBias = sweep.bias;
    volumeRatio = sweep.volumeRatio;
    volumeOk = sweep.volumeOk;
    sweepReason = sweep.reason;
  } catch {
    /* optional */
  }

  const runBias = deriveProfitRunBias(thesis, volumeRatio);

  const mega =
    coin === 'BTC' || coin === 'ETH'
      ? { ok: true, reason: 'mega pair — self' }
      : validateMegaPairVolumeForDirection(direction);

  const sweepConfirms =
    sweepBias === direction && volumeOk;
  const strongRun =
    runBias === 'strong_run' || runBias === 'run';
  const weakness = runBias === 'fade' || runBias === 'reversal';

  let deferClose = false;
  let reason = '';

  if (pnlUsd <= 0) {
    reason = 'uPnL not green — no defer';
  } else if (weakness || thesis.macroAgainst || thesis.signalAgainst) {
    reason = `weakness ${runBias} — close at trail floor`;
  } else if (!mega.ok) {
    reason = `mega flow against — ${mega.reason}`;
  } else if (sweepConfirms) {
    deferClose = true;
    reason = `Liquidity sweep confirms ${direction} — ${sweepReason}`;
  } else if (strongRun && thesis.thesisIntact && mega.ok) {
    deferClose = true;
    reason = `Strong run (${runBias}) + thesis intact — let winner run`;
  } else if (strongRun && volumeOk && thesis.thesisIntact) {
    deferClose = true;
    reason = `Volume ${volumeRatio.toFixed(2)}x + thesis intact — expect rebound`;
  } else {
    reason = `No sweep rebound — close at floor ($${floorUsd.toFixed(3)}, peak $${peakUsd.toFixed(3)})`;
  }

  const logLine = [
    `trail touch +$${pnlUsd.toFixed(3)} floor $${floorUsd.toFixed(3)}`,
    sweepReason,
    `bias ${runBias}`,
    thesis.mtfSummary.slice(0, 80),
    mega.reason.slice(0, 60),
    deferClose ? 'DEFER close' : 'CLOSE now',
  ].join(' · ');

  return {
    deferClose,
    reason,
    sweepBias,
    volumeRatio,
    volumeOk,
    runBias,
    thesis,
    megaOk: mega.ok,
    logLine,
  };
}

export function logTrailPullbackAnalysis(
  user: string,
  coin: string,
  verdict: TrailPullbackVerdict,
  deferred: boolean
): void {
  logger.info(deferred ? 'HL trail close deferred — sweep rebound' : 'HL trail floor — closing', {
    user: user.slice(0, 10),
    coin,
    defer: deferred,
    reason: verdict.reason.slice(0, 220),
    detail: verdict.logLine.slice(0, 320),
  });
}
