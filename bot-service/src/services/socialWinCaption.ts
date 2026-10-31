/**
 * Shared win-flyer caption for X / Instagram / Facebook.
 *
 * Another solid close.
 * LONG $BTC
 * +$39.58
 * +11.98% ROI
 * Quiet execution.
 * No hype, just results.
 * That’s what we built it for.
 * #$BTC #Hyperliquid #HyperGain
 */
import { winFlyerRoiPct } from './tradeShareFlyer';

export type WinCaptionTrade = {
  coin: string;
  side: 'LONG' | 'SHORT';
  pnlUsd: number;
  /** ROE % on margin when known; omit line if null. */
  roiPct?: number | null;
  closePrice?: number | null;
  entryPrice?: number | null;
  size?: number | null;
  leverage?: number | null;
};

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const body = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n >= 0 ? `+$${body}` : `-$${body}`;
}

function fmtRoi(pct: number): string {
  const abs = Math.abs(pct);
  const digits = abs >= 10 ? 2 : 2;
  const body = abs.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return pct >= 0 ? `+${body}% ROI` : `-${body}% ROI`;
}

/** Resolve ROI from explicit pct or from trade geometry. */
export function resolveWinRoiPct(trade: WinCaptionTrade): number | null {
  if (trade.roiPct != null && Number.isFinite(trade.roiPct)) {
    return trade.roiPct;
  }
  const close = Number(trade.closePrice);
  const entry = trade.entryPrice != null ? Number(trade.entryPrice) : null;
  const size = Math.abs(Number(trade.size) || 0);
  if (!(close > 0) || !(size > 0)) return null;
  const computed = winFlyerRoiPct({
    side: trade.side,
    closedPnlUsd: trade.pnlUsd,
    closePrice: close,
    entryPrice: entry,
    size,
    leverage: trade.leverage ?? null,
  });
  return computed?.pct ?? null;
}

export function composeSolidCloseCaption(trade: WinCaptionTrade): string {
  const coin = String(trade.coin || 'TRADE')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') || 'TRADE';
  const side = trade.side === 'SHORT' ? 'SHORT' : 'LONG';
  const pnlLine = fmtMoney(trade.pnlUsd);
  const roi = resolveWinRoiPct(trade);
  const lines = [
    'Another solid close.',
    `${side} $${coin}`,
    pnlLine,
    ...(roi != null && Number.isFinite(roi) ? [fmtRoi(roi)] : []),
    'Quiet execution.',
    'No hype, just results.',
    'That’s what we built it for.',
    `#$${coin} #Hyperliquid #HyperGain`,
  ];
  return lines.join('\n');
}

/** Twitter hard cap — trim trailing soft lines first if needed. */
export function composeSolidCloseCaptionForX(trade: WinCaptionTrade): string {
  let text = composeSolidCloseCaption(trade);
  if (text.length <= 280) return text;
  const coin = String(trade.coin || 'TRADE')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') || 'TRADE';
  const side = trade.side === 'SHORT' ? 'SHORT' : 'LONG';
  const roi = resolveWinRoiPct(trade);
  const short = [
    'Another solid close.',
    `${side} $${coin}`,
    fmtMoney(trade.pnlUsd),
    ...(roi != null ? [fmtRoi(roi)] : []),
    `#$${coin} #Hyperliquid #HyperGain`,
  ].join('\n');
  return short.length <= 280 ? short : short.slice(0, 277) + '…';
}
