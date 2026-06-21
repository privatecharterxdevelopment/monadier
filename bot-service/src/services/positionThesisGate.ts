/**
 * Live thesis check for open HL positions.
 * Closes on signal/macro reversal; defers mechanical stop_loss while thesis intact.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { evaluateMacroBetaAlignment, type MacroBetaResult } from './macroBetaGate';
import { analyzeMarketMTFBySymbol } from './market';
import { hlCoinToBinanceSymbol } from './hlSymbols';

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
  if (slPct <= 0) return false;
  const mult = config.hyperliquid.thesisMaxLossSlMultiple;
  const minUsd = config.hyperliquid.thesisMaxLossUsd;
  return pnlPct <= -slPct * mult || pnlUsd <= -minUsd;
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
