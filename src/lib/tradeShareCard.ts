import QRCode from 'qrcode';
import { BRAND_NAME } from './brand';
import { fillPositionDirection, priceFractionDigits } from './hyperliquid/format';
import { toNum } from './hyperliquid/parse';
import type { AggregatedHlCloseFill } from './hyperliquid/hlFillAggregate';
import { normalizeReferralCode } from './referralCapture';

export type TradeShareCardInput = {
  displayName: string;
  avatarUrl?: string | null;
  coin: string;
  side: 'LONG' | 'SHORT';
  closedPnlUsd: number;
  closePrice: number;
  entryPrice: number | null;
  size: number;
  closedAtMs: number;
  referralCode: string;
  venueLabel?: string;
  /** Used for ROE% on the card (margin ≈ notional / leverage). */
  leverage?: number | null;
};

const W = 720;
const H = 980;
/** Share-card wordmark — camelCase per brand ask. */
const SHARE_BRAND = 'hyperGain';
const FONT = `"Open Sans", "DM Sans", system-ui, sans-serif`;
/** QR always targets live app — never localhost / preview hosts. */
const QR_APP_BASE = 'https://app.hypergain.io';

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  const body = abs.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (n > 0) return `+${body}`;
  if (n < 0) return `-${body}`;
  return body;
}

function fmtPx(n: number): string {
  const digits = priceFractionDigits(n);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  });
}

function fmtPct(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 10 ? 1 : 2;
  const body = abs.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (n > 0) return `+${body}%`;
  if (n < 0) return `-${body}%`;
  return `${body}%`;
}

function fmtStamp(ms: number): string {
  try {
    return new Date(ms).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    });
  } catch {
    return '';
  }
}

/** ROE on margin if leverage known; else price move % from entry→close. */
export function tradeShareRoiPct(input: {
  side: 'LONG' | 'SHORT';
  closedPnlUsd: number;
  closePrice: number;
  entryPrice: number | null;
  size: number;
  leverage?: number | null;
}): { pct: number; label: 'ROE' | 'MOVE' } | null {
  const entry = input.entryPrice;
  const sz = Math.abs(input.size);
  if (!(sz > 0) || !(input.closePrice > 0)) return null;
  const lev = input.leverage != null && input.leverage > 0 ? input.leverage : null;
  if (lev && entry != null && entry > 0) {
    const notional = sz * entry;
    const margin = notional / lev;
    if (margin > 0) return { pct: (input.closedPnlUsd / margin) * 100, label: 'ROE' };
  }
  if (entry != null && entry > 0) {
    const move =
      input.side === 'LONG'
        ? ((input.closePrice - entry) / entry) * 100
        : ((entry - input.closePrice) / entry) * 100;
    return { pct: move, label: 'MOVE' };
  }
  return null;
}

/** Infer entry from close PnL when HL fill has no entry field. */
export function estimateEntryFromClose(opts: {
  side: 'LONG' | 'SHORT';
  closePrice: number;
  size: number;
  closedPnlUsd: number;
}): number | null {
  const sz = Math.abs(opts.size);
  if (!(sz > 0) || !(opts.closePrice > 0)) return null;
  const delta = opts.closedPnlUsd / sz;
  const entry = opts.side === 'LONG' ? opts.closePrice - delta : opts.closePrice + delta;
  return Number.isFinite(entry) && entry > 0 ? entry : null;
}

export function tradeShareInputFromCloseFill(
  fill: AggregatedHlCloseFill,
  opts: {
    displayName: string;
    avatarUrl?: string | null;
    referralCode: string;
    venueLabel?: string;
    leverage?: number | null;
  }
): TradeShareCardInput {
  const side = fillPositionDirection(fill);
  const closePrice = toNum(fill.px);
  const size = toNum(fill.sz);
  const closedPnlUsd = toNum(fill.closedPnl);
  return {
    displayName: opts.displayName,
    avatarUrl: opts.avatarUrl,
    coin: fill.coin,
    side,
    closedPnlUsd,
    closePrice,
    entryPrice: estimateEntryFromClose({ side, closePrice, size, closedPnlUsd }),
    size,
    closedAtMs: fill.time,
    referralCode: opts.referralCode,
    venueLabel: opts.venueLabel ?? 'Hyperliquid Perp',
    leverage: opts.leverage ?? null,
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function setType(
  ctx: CanvasRenderingContext2D,
  weight: number,
  size: number,
  tracking = '-0.02em'
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = tracking;
  }
}

async function ensureShareFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load(`700 64px ${FONT}`),
      document.fonts.load(`800 88px ${FONT}`),
      document.fonts.load(`600 22px ${FONT}`),
      document.fonts.load(`500 18px ${FONT}`),
    ]);
  } catch {
    /* fall back to system stack */
  }
}

function loadImage(src: string, cors = true): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors && !src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function qrTargetUrl(referralCode: string): string {
  const code = normalizeReferralCode(referralCode) ?? referralCode.trim().toUpperCase();
  return `${QR_APP_BASE}/?ref=${encodeURIComponent(code || 'HYPERGAIN')}`;
}

/**
 * Robust QR bitmap — toDataURL → Image (avoids blank/toCanvas scale bugs).
 * Always dark-on-white for scan reliability on silver cards.
 */
async function renderQrImage(url: string, size: number): Promise<HTMLImageElement | null> {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      margin: 2,
      width: size,
      color: { dark: '#111113', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
    return loadImage(dataUrl, false);
  } catch {
    return null;
  }
}

export async function renderTradeShareCardPng(
  input: TradeShareCardInput
): Promise<Blob> {
  await ensureShareFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Readable silver metal (not near-white paper)
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#e4e6eb');
  bg.addColorStop(0.35, '#d2d5dc');
  bg.addColorStop(0.7, '#b8bcc6');
  bg.addColorStop(1, '#9ea3af');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const sheen = ctx.createLinearGradient(0, 0, W, H * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,0.35)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.12)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  const ink = '#1a1a1e';
  const mute = '#6b6e76';
  const soft = '#8a8e97';
  const profit = input.closedPnlUsd >= 0;
  const accent = profit ? '#1f7a4d' : '#b42338';
  const sideColor = input.side === 'LONG' ? '#1f7a4d' : '#b42338';

  // Brand — quiet hero
  setType(ctx, 700, 36, '-0.04em');
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(SHARE_BRAND, 56, 72);

  // Trader row (minimal — no heavy avatar chrome)
  const name = input.displayName.trim() || `${BRAND_NAME} trader`;
  const avatarX = 56;
  const avatarY = 108;
  const avatarR = 18;
  const avatar = input.avatarUrl ? await loadImage(input.avatarUrl) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, avatarX, avatarY, avatarR * 2, avatarR * 2);
  } else {
    ctx.fillStyle = 'rgba(26,26,30,0.08)';
    ctx.fillRect(avatarX, avatarY, avatarR * 2, avatarR * 2);
    setType(ctx, 700, 14, '-0.02em');
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 1).toUpperCase(), avatarX + avatarR, avatarY + avatarR + 0.5);
  }
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setType(ctx, 600, 18, '-0.02em');
  ctx.fillStyle = ink;
  ctx.fillText(name, avatarX + avatarR * 2 + 12, avatarY + 16);
  setType(ctx, 500, 13, '0');
  ctx.fillStyle = soft;
  ctx.fillText(fmtStamp(input.closedAtMs), avatarX + avatarR * 2 + 12, avatarY + 36);

  // Pair + side
  setType(ctx, 700, 48, '-0.045em');
  ctx.fillStyle = ink;
  ctx.fillText(`${input.coin} PERP`, 56, 240);

  const sideLabel = input.side === 'LONG' ? 'Long' : 'Short';
  setType(ctx, 600, 20, '-0.02em');
  ctx.fillStyle = sideColor;
  ctx.fillText(sideLabel, 56, 276);
  const sideW = ctx.measureText(sideLabel).width;
  ctx.fillStyle = soft;
  ctx.fillText(`  ·  ${input.venueLabel ?? 'Hyperliquid'}`, 56 + sideW, 276);

  // PnL — one clear number
  const pnlText = fmtMoney(input.closedPnlUsd);
  setType(ctx, 800, 88, '-0.05em');
  ctx.fillStyle = accent;
  ctx.fillText(pnlText, 56, 400);
  const pnlW = ctx.measureText(pnlText).width;
  setType(ctx, 600, 28, '-0.02em');
  ctx.fillStyle = mute;
  ctx.fillText('USD', 56 + pnlW + 12, 400);

  const roi = tradeShareRoiPct(input);
  if (roi) {
    setType(ctx, 600, 28, '-0.03em');
    ctx.fillStyle = accent;
    const pct = fmtPct(roi.pct);
    ctx.fillText(pct, 56, 446);
    const pctW = ctx.measureText(pct).width;
    setType(ctx, 500, 14, '0.04em');
    ctx.fillStyle = soft;
    ctx.fillText(roi.label === 'ROE' ? 'ROE' : 'MOVE', 56 + pctW + 10, 446);
  }

  // Hairline
  ctx.strokeStyle = 'rgba(26,26,30,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 500);
  ctx.lineTo(W - 56, 500);
  ctx.stroke();

  // Stats — two columns, no boxes
  setType(ctx, 500, 12, '0.08em');
  ctx.fillStyle = soft;
  ctx.fillText('ENTRY', 56, 548);
  ctx.fillText('CLOSE', 360, 548);
  setType(ctx, 700, 30, '-0.03em');
  ctx.fillStyle = ink;
  ctx.fillText(input.entryPrice != null ? fmtPx(input.entryPrice) : '—', 56, 592);
  ctx.fillText(fmtPx(input.closePrice), 360, 592);

  setType(ctx, 500, 15, '-0.01em');
  ctx.fillStyle = mute;
  const levLabel =
    input.leverage != null && input.leverage > 0 ? ` · ${Math.round(input.leverage)}×` : '';
  ctx.fillText(`Size ${fmtPx(Math.abs(input.size))} ${input.coin}${levLabel}`, 56, 640);

  // Hairline before QR — keep block high so modal preview always shows it
  ctx.strokeStyle = 'rgba(26,26,30,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 690);
  ctx.lineTo(W - 56, 690);
  ctx.stroke();

  const referralUrl = qrTargetUrl(input.referralCode);
  const q = 168;
  const qx = W - 56 - q;
  const qy = 730;
  const qrImg = await renderQrImage(referralUrl, q * 2);

  ctx.beginPath();
  roundRect(ctx, qx - 12, qy - 12, q + 24, q + 24, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(26,26,30,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (qrImg) {
    ctx.drawImage(qrImg, qx, qy, q, q);
  } else {
    setType(ctx, 500, 13, '0');
    ctx.fillStyle = mute;
    ctx.textAlign = 'center';
    ctx.fillText('app.hypergain.io', qx + q / 2, qy + q / 2);
    ctx.textAlign = 'left';
  }

  setType(ctx, 700, 22, '-0.03em');
  ctx.fillStyle = ink;
  ctx.fillText(SHARE_BRAND, 56, qy + 36);
  setType(ctx, 500, 15, '0');
  ctx.fillStyle = soft;
  ctx.fillText('Scan to join', 56, qy + 64);
  setType(ctx, 600, 16, '-0.01em');
  ctx.fillStyle = mute;
  ctx.fillText(input.referralCode, 56, qy + 98);
  setType(ctx, 500, 13, '0');
  ctx.fillStyle = soft;
  ctx.fillText('app.hypergain.io', 56, qy + 128);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Failed to encode share image'));
        else resolve(blob);
      },
      'image/png',
      1
    );
  });
}

export function downloadTradeSharePng(blob: Blob, coin: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hypergain-${coin.toLowerCase()}-trade.png`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareTradeSharePng(blob: Blob, coin: string): Promise<boolean> {
  const file = new File([blob], `hypergain-${coin.toLowerCase()}-trade.png`, {
    type: 'image/png',
  });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: `${SHARE_BRAND} ${coin} trade`,
      text: `My ${coin} trade on ${SHARE_BRAND}`,
    });
    return true;
  }
  downloadTradeSharePng(blob, coin);
  return false;
}
