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
const H = 1080;
const SHARE_BRAND = 'hyperGain';
const FONT_DISPLAY = '"Montserrat", "Open Sans", system-ui, sans-serif';
const FONT_BODY = '"Open Sans", "Montserrat", system-ui, sans-serif';
const QR_APP_BASE = 'https://app.hypergain.io';

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  const body = abs.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (n > 0) return `+$${body}`;
  if (n < 0) return `-$${body}`;
  return `$${body}`;
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
  family: string,
  tracking = '0'
) {
  ctx.font = `${weight} ${size}px ${family}`;
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = tracking;
  }
}

let fontsReady: Promise<void> | null = null;

async function ensureShareFonts(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (!fontsReady) {
    fontsReady = (async () => {
      try {
        const faces = [
          new FontFace('Montserrat', 'url(/fonts/Montserrat-SemiBold.ttf)', { weight: '600' }),
          new FontFace('Montserrat', 'url(/fonts/Montserrat-Bold.ttf)', { weight: '700' }),
          new FontFace('Montserrat', 'url(/fonts/Montserrat-ExtraBold.ttf)', { weight: '800' }),
          new FontFace('Open Sans', 'url(/fonts/OpenSans-Regular.ttf)', { weight: '400' }),
          new FontFace('Open Sans', 'url(/fonts/OpenSans-SemiBold.ttf)', { weight: '600' }),
          new FontFace('Open Sans', 'url(/fonts/OpenSans-Bold.ttf)', { weight: '700' }),
        ];
        await Promise.all(
          faces.map(async (f) => {
            const loaded = await f.load();
            document.fonts.add(loaded);
          })
        );
      } catch {
        /* CDN Open Sans / Montserrat from index.html may still work */
      }
      if (document.fonts?.load) {
        await Promise.all([
          document.fonts.load(`700 48px ${FONT_DISPLAY}`),
          document.fonts.load(`800 72px ${FONT_DISPLAY}`),
          document.fonts.load(`600 20px ${FONT_BODY}`),
          document.fonts.load(`400 16px ${FONT_BODY}`),
        ]).catch(() => undefined);
      }
    })();
  }
  await fontsReady;
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

async function renderQrImage(url: string, size: number): Promise<HTMLImageElement | null> {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      margin: 0,
      width: size,
      color: { dark: '#141418', light: '#ffffff' },
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

  // Soft field behind the card — keep it pale (was reading too dark on X/IG)
  ctx.fillStyle = '#f4f5f7';
  ctx.fillRect(0, 0, W, H);

  // Opaque card panel
  const pad = 40;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 28);
  ctx.fillStyle = '#fbfbfc';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,24,0.05)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const ink = '#141418';
  const mute = '#7a7f8a';
  const soft = '#9aa0ab';
  const profit = input.closedPnlUsd >= 0;
  const accent = profit ? '#1a6b45' : '#a61e32';
  const sideColor = input.side === 'LONG' ? '#1a6b45' : '#a61e32';
  const left = pad + 44;
  const right = W - pad - 44;
  const contentW = right - left;

  // Brand
  setType(ctx, 700, 34, FONT_DISPLAY, '-0.03em');
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(SHARE_BRAND, left, pad + 78);

  setType(ctx, 500, 13, FONT_BODY, '0.06em');
  ctx.fillStyle = soft;
  ctx.fillText('TRADE RESULT', left, pad + 102);

  // Trader
  const name = input.displayName.trim() || `${BRAND_NAME} trader`;
  const avatarX = left;
  const avatarY = pad + 130;
  const avatarR = 20;
  const avatar = input.avatarUrl ? await loadImage(input.avatarUrl) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, avatarX, avatarY, avatarR * 2, avatarR * 2);
  } else {
    ctx.fillStyle = '#e6e8ee';
    ctx.fillRect(avatarX, avatarY, avatarR * 2, avatarR * 2);
    setType(ctx, 700, 15, FONT_DISPLAY, '0');
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 1).toUpperCase(), avatarX + avatarR, avatarY + avatarR + 0.5);
  }
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setType(ctx, 600, 18, FONT_BODY, '-0.01em');
  ctx.fillStyle = ink;
  ctx.fillText(name, avatarX + avatarR * 2 + 14, avatarY + 18);
  setType(ctx, 400, 13, FONT_BODY, '0');
  ctx.fillStyle = soft;
  ctx.fillText(fmtStamp(input.closedAtMs), avatarX + avatarR * 2 + 14, avatarY + 38);

  // Pair
  setType(ctx, 800, 52, FONT_DISPLAY, '-0.04em');
  ctx.fillStyle = ink;
  ctx.fillText(`${input.coin} PERP`, left, pad + 250);

  const sideLabel = input.side === 'LONG' ? 'Long' : 'Short';
  setType(ctx, 600, 18, FONT_BODY, '0');
  ctx.fillStyle = sideColor;
  ctx.fillText(sideLabel, left, pad + 282);
  const sideW = ctx.measureText(sideLabel).width;
  ctx.fillStyle = soft;
  ctx.fillText(`  ·  ${input.venueLabel ?? 'Hyperliquid Perp'}`, left + sideW, pad + 282);

  // PnL hero
  const pnlText = fmtMoney(input.closedPnlUsd);
  setType(ctx, 800, 78, FONT_DISPLAY, '-0.045em');
  ctx.fillStyle = accent;
  ctx.fillText(pnlText, left, pad + 390);

  const roi = tradeShareRoiPct(input);
  if (roi) {
    setType(ctx, 600, 26, FONT_DISPLAY, '-0.02em');
    ctx.fillStyle = accent;
    ctx.fillText(`${fmtPct(roi.pct)} ${roi.label}`, left, pad + 430);
  }

  // Divider
  ctx.strokeStyle = 'rgba(20,20,24,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, pad + 470);
  ctx.lineTo(right, pad + 470);
  ctx.stroke();

  // Stats grid — 2×2
  const col2 = left + contentW / 2 + 12;
  const row1 = pad + 520;
  const row2 = pad + 610;
  const lev =
    input.leverage != null && input.leverage > 0 ? `${Math.round(input.leverage)}×` : '—';

  const cells: Array<{ label: string; value: string; x: number; y: number }> = [
    { label: 'ENTRY', value: input.entryPrice != null ? fmtPx(input.entryPrice) : '—', x: left, y: row1 },
    { label: 'CLOSE', value: fmtPx(input.closePrice), x: col2, y: row1 },
    { label: 'SIZE', value: `${fmtPx(Math.abs(input.size))} ${input.coin}`, x: left, y: row2 },
    { label: 'LEVERAGE', value: lev, x: col2, y: row2 },
  ];
  for (const cell of cells) {
    setType(ctx, 600, 11, FONT_BODY, '0.12em');
    ctx.fillStyle = soft;
    ctx.fillText(cell.label, cell.x, cell.y);
    setType(ctx, 700, 28, FONT_DISPLAY, '-0.02em');
    ctx.fillStyle = ink;
    ctx.fillText(cell.value, cell.x, cell.y + 36);
  }

  // Footer band
  const footY = H - pad - 220;
  ctx.strokeStyle = 'rgba(20,20,24,0.1)';
  ctx.beginPath();
  ctx.moveTo(left, footY);
  ctx.lineTo(right, footY);
  ctx.stroke();

  const referralCode =
    normalizeReferralCode(input.referralCode) ?? input.referralCode.trim().toUpperCase();
  const referralUrl = qrTargetUrl(referralCode);

  // QR sits fully inside the card: white box on content-right, QR centered with equal pad.
  const qrSize = 132;
  const qrBoxPad = 14;
  const qrBoxSize = qrSize + qrBoxPad * 2;
  const cardBottom = H - pad;
  const qrBoxX = Math.round(right - qrBoxSize);
  const qrBoxY = Math.round(Math.min(footY + 36, cardBottom - 48 - qrBoxSize));
  const qrX = qrBoxX + qrBoxPad;
  const qrY = qrBoxY + qrBoxPad;
  const qrImg = await renderQrImage(referralUrl, qrSize);

  roundRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  roundRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 14);
  ctx.strokeStyle = 'rgba(20,20,24,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (qrImg) {
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  }

  setType(ctx, 700, 22, FONT_DISPLAY, '-0.02em');
  ctx.fillStyle = ink;
  ctx.fillText(SHARE_BRAND, left, footY + 56);
  setType(ctx, 400, 14, FONT_BODY, '0');
  ctx.fillStyle = mute;
  ctx.fillText('Scan to join on Hyperliquid', left, footY + 84);
  setType(ctx, 600, 15, FONT_BODY, '0.04em');
  ctx.fillStyle = ink;
  ctx.fillText(referralCode, left, footY + 120);
  setType(ctx, 400, 13, FONT_BODY, '0');
  ctx.fillStyle = soft;
  ctx.fillText('app.hypergain.io', left, footY + 148);

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
