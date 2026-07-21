import QRCode from 'qrcode';
import { BRAND_NAME } from './brand';
import { fillPositionDirection, priceFractionDigits } from './hyperliquid/format';
import { toNum } from './hyperliquid/parse';
import type { AggregatedHlCloseFill } from './hyperliquid/hlFillAggregate';
import { buildReferralShareUrl } from './referralCapture';

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
};

const W = 720;
const H = 1280;
/** Share-card wordmark — camelCase per brand ask. */
const SHARE_BRAND = 'hyperGain';
const FONT = `"Open Sans", "DM Sans", system-ui, sans-serif`;

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

function fmtStamp(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '—';
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
  tracking = '-0.03em'
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

async function renderQrImage(url: string, size: number): Promise<HTMLCanvasElement | HTMLImageElement | null> {
  try {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, url, {
      margin: 1,
      width: size,
      color: { dark: '#0a0a0a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
    return canvas;
  } catch {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        margin: 1,
        width: size,
        color: { dark: '#0a0a0a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
      return loadImage(dataUrl, false);
    } catch {
      return null;
    }
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

  // Atmosphere
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#12141a');
  bg.addColorStop(0.45, '#0b0c0f');
  bg.addColorStop(1, '#070809');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft silver diamonds
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = '#d4d4dc';
  ctx.lineWidth = 1.25;
  for (let i = 0; i < 8; i++) {
    const cx = (i % 4) * 220 - 40;
    const cy = Math.floor(i / 4) * 520 + 200;
    ctx.beginPath();
    ctx.moveTo(cx + 110, cy);
    ctx.lineTo(cx + 220, cy + 110);
    ctx.lineTo(cx + 110, cy + 220);
    ctx.lineTo(cx, cy + 110);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();

  // Top silver accent
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, '#8e8e98');
  bar.addColorStop(0.5, '#f2f2f5');
  bar.addColorStop(1, '#8e8e98');
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, 5);

  // Brand first — hero signal
  setType(ctx, 700, 42, '-0.04em');
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(SHARE_BRAND, 56, 78);
  setType(ctx, 500, 16, '-0.01em');
  ctx.fillStyle = '#8b8b93';
  ctx.fillText('Bot trading on Hyperliquid', 56, 106);

  // Avatar + trader
  const name = input.displayName.trim() || `${BRAND_NAME} trader`;
  const avatarX = 56;
  const avatarY = 148;
  const avatarR = 26;
  const avatar = input.avatarUrl ? await loadImage(input.avatarUrl) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, avatarX, avatarY, avatarR * 2, avatarR * 2);
  } else {
    ctx.fillStyle = '#1a1b1f';
    ctx.fillRect(avatarX, avatarY, avatarR * 2, avatarR * 2);
    setType(ctx, 700, 20, '-0.02em');
    ctx.fillStyle = '#3dd68c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 1).toUpperCase(), avatarX + avatarR, avatarY + avatarR + 1);
  }
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setType(ctx, 700, 24, '-0.03em');
  ctx.fillStyle = '#f4f4f5';
  ctx.fillText(name, avatarX + avatarR * 2 + 14, avatarY + 24);
  setType(ctx, 500, 16, '-0.01em');
  ctx.fillStyle = '#8b8b93';
  ctx.fillText(fmtStamp(input.closedAtMs), avatarX + avatarR * 2 + 14, avatarY + 48);

  // Pair + side
  const pair = `${input.coin} PERP`;
  setType(ctx, 800, 56, '-0.045em');
  ctx.fillStyle = '#ffffff';
  ctx.fillText(pair, 56, 290);

  const sideLabel = input.side === 'LONG' ? 'Long' : 'Short';
  const sideColor = input.side === 'LONG' ? '#3dd68c' : '#f6465d';
  setType(ctx, 700, 26, '-0.03em');
  ctx.fillStyle = sideColor;
  ctx.fillText(sideLabel, 56, 336);
  const sideW = ctx.measureText(sideLabel).width;
  ctx.fillStyle = '#8b8b93';
  ctx.fillText(`  ·  ${input.venueLabel ?? 'Hyperliquid Perp'}`, 56 + sideW, 336);

  // PnL hero
  const profit = input.closedPnlUsd >= 0;
  const pnlText = fmtMoney(input.closedPnlUsd);
  setType(ctx, 800, 92, '-0.05em');
  ctx.fillStyle = profit ? '#3dd68c' : '#f6465d';
  ctx.fillText(pnlText, 56, 470);
  const pnlW = ctx.measureText(pnlText).width;
  setType(ctx, 700, 34, '-0.03em');
  ctx.fillStyle = '#ffffff';
  ctx.fillText('USD', 56 + pnlW + 14, 470);

  // Stats — no heavy card chrome
  setType(ctx, 600, 15, '0.04em');
  ctx.fillStyle = '#6f6f78';
  ctx.fillText('ENTRY', 56, 560);
  ctx.fillText('AVG CLOSE', 360, 560);
  setType(ctx, 700, 34, '-0.04em');
  ctx.fillStyle = '#ffffff';
  ctx.fillText(input.entryPrice != null ? fmtPx(input.entryPrice) : '—', 56, 608);
  ctx.fillText(fmtPx(input.closePrice), 360, 608);
  setType(ctx, 500, 18, '-0.02em');
  ctx.fillStyle = '#8b8b93';
  ctx.fillText(`Size ${fmtPx(input.size)} ${input.coin}`, 56, 650);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 690);
  ctx.lineTo(W - 56, 690);
  ctx.stroke();

  // Brand + QR — high enough to show in the share popup first screen
  const referralUrl = buildReferralShareUrl(input.referralCode);
  const qrImg = await renderQrImage(referralUrl, 220);

  const footY = 730;
  roundRect(ctx, 48, footY, W - 96, 260, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.stroke();

  ctx.strokeStyle = '#3dd68c';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  const mx = 92;
  const my = footY + 78;
  ctx.beginPath();
  ctx.moveTo(mx, my - 13);
  ctx.lineTo(mx, my + 13);
  ctx.moveTo(mx - 13, my);
  ctx.lineTo(mx + 13, my);
  ctx.stroke();

  setType(ctx, 700, 32, '-0.04em');
  ctx.fillStyle = '#ffffff';
  ctx.fillText(SHARE_BRAND, 120, footY + 88);
  setType(ctx, 500, 17, '-0.01em');
  ctx.fillStyle = '#8b8b93';
  ctx.fillText('Scan to join & trade', 120, footY + 122);
  setType(ctx, 700, 19, '-0.02em');
  ctx.fillStyle = '#3dd68c';
  ctx.fillText(`Referral ${input.referralCode}`, 120, footY + 162);
  setType(ctx, 500, 15, '0');
  ctx.fillStyle = '#63636b';
  ctx.fillText('app.hypergain.io', 120, footY + 196);

  if (qrImg) {
    const q = 176;
    const qx = W - 56 - 30 - q;
    const qy = footY + (260 - q) / 2;
    roundRect(ctx, qx - 10, qy - 10, q + 20, q + 20, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.drawImage(qrImg, qx, qy, q, q);
  } else {
    const q = 176;
    const qx = W - 56 - 30 - q;
    const qy = footY + (260 - q) / 2;
    roundRect(ctx, qx, qy, q, q, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    setType(ctx, 700, 16, '0');
    ctx.fillStyle = '#0a0a0a';
    ctx.textAlign = 'center';
    ctx.fillText('QR', qx + q / 2, qy + q / 2 + 4);
    ctx.textAlign = 'left';
  }

  setType(ctx, 700, 22, '-0.04em');
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'center';
  ctx.fillText(SHARE_BRAND, W / 2, H - 72);
  setType(ctx, 500, 14, '0');
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillText('Share your edge', W / 2, H - 44);
  ctx.textAlign = 'left';

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
