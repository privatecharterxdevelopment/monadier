import QRCode from 'qrcode';
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
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function renderTradeShareCardPng(
  input: TradeShareCardInput
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  // Soft geometric diamonds (Binance-like atmosphere, HyperGain palette)
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#3dd68c';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const cx = (i % 4) * 220 - 40;
    const cy = Math.floor(i / 4) * 520 + 180;
    ctx.beginPath();
    ctx.moveTo(cx + 110, cy);
    ctx.lineTo(cx + 220, cy + 110);
    ctx.lineTo(cx + 110, cy + 220);
    ctx.lineTo(cx, cy + 110);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();

  // Top accent bar
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#1a6b45');
  grad.addColorStop(0.5, '#3dd68c');
  grad.addColorStop(1, '#1a6b45');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 6);

  // Avatar + name
  const name = input.displayName.trim() || 'HyperGain trader';
  const avatarX = 56;
  const avatarY = 56;
  const avatarR = 28;
  const avatar = input.avatarUrl ? await loadImage(input.avatarUrl) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, avatarX, avatarY, avatarR * 2, avatarR * 2);
  } else {
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(avatarX, avatarY, avatarR * 2, avatarR * 2);
    ctx.fillStyle = '#3dd68c';
    ctx.font = '700 22px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 1).toUpperCase(), avatarX + avatarR, avatarY + avatarR + 1);
  }
  ctx.restore();

  ctx.fillStyle = '#f5f5f5';
  ctx.font = '700 26px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, avatarX + avatarR * 2 + 16, avatarY + 28);
  ctx.fillStyle = '#8a8a8a';
  ctx.font = '500 18px Inter, system-ui, sans-serif';
  ctx.fillText(fmtStamp(input.closedAtMs), avatarX + avatarR * 2 + 16, avatarY + 54);

  // Pair
  const pair = `${input.coin} PERP`;
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 52px Inter, system-ui, sans-serif';
  ctx.fillText(pair, 56, 220);

  const sideColor = input.side === 'LONG' ? '#3dd68c' : '#f6465d';
  ctx.fillStyle = sideColor;
  ctx.font = '700 28px Inter, system-ui, sans-serif';
  ctx.fillText(input.side === 'LONG' ? 'Long' : 'Short', 56, 268);
  ctx.fillStyle = '#8a8a8a';
  ctx.fillText(`  ·  ${input.venueLabel ?? 'Hyperliquid Perp'}`, 56 + ctx.measureText(input.side === 'LONG' ? 'Long' : 'Short').width, 268);

  // PnL hero
  const profit = input.closedPnlUsd >= 0;
  ctx.fillStyle = profit ? '#3dd68c' : '#f6465d';
  ctx.font = '800 84px Inter, system-ui, sans-serif';
  const pnlText = fmtMoney(input.closedPnlUsd);
  ctx.fillText(pnlText, 56, 430);
  const pnlW = ctx.measureText(pnlText).width;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 36px Inter, system-ui, sans-serif';
  ctx.fillText('USD', 56 + pnlW + 16, 430);

  // Entry / close box
  roundRect(ctx, 56, 500, W - 112, 180, 18);
  ctx.fillStyle = '#141414';
  ctx.fill();
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#8a8a8a';
  ctx.font = '600 18px Inter, system-ui, sans-serif';
  ctx.fillText('Entry Price', 88, 560);
  ctx.fillText('Average Close Price', 380, 560);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 30px Inter, system-ui, sans-serif';
  ctx.fillText(input.entryPrice != null ? fmtPx(input.entryPrice) : '—', 88, 610);
  ctx.fillText(fmtPx(input.closePrice), 380, 610);

  ctx.fillStyle = '#8a8a8a';
  ctx.font = '500 16px Inter, system-ui, sans-serif';
  ctx.fillText(`Size ${fmtPx(input.size)} ${input.coin}`, 88, 650);

  // Footer brand + QR
  const referralUrl = buildReferralShareUrl(input.referralCode);
  const qrDataUrl = await QRCode.toDataURL(referralUrl, {
    margin: 1,
    width: 200,
    color: { dark: '#0a0a0a', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });
  const qrImg = await loadImage(qrDataUrl);

  roundRect(ctx, 56, H - 320, W - 112, 240, 18);
  ctx.fillStyle = '#121212';
  ctx.fill();
  ctx.strokeStyle = '#2a2a2a';
  ctx.stroke();

  // Plus mark
  ctx.strokeStyle = '#3dd68c';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  const mx = 96;
  const my = H - 250;
  ctx.beginPath();
  ctx.moveTo(mx, my - 14);
  ctx.lineTo(mx, my + 14);
  ctx.moveTo(mx - 14, my);
  ctx.lineTo(mx + 14, my);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 28px Inter, system-ui, sans-serif';
  ctx.fillText('HyperGain', 124, H - 240);
  ctx.fillStyle = '#8a8a8a';
  ctx.font = '600 16px Inter, system-ui, sans-serif';
  ctx.fillText('Bot trading on Hyperliquid', 124, H - 212);
  ctx.fillStyle = '#3dd68c';
  ctx.font = '700 18px Inter, system-ui, sans-serif';
  ctx.fillText(`Referral ${input.referralCode}`, 124, H - 170);
  ctx.fillStyle = '#666666';
  ctx.font = '500 14px Inter, system-ui, sans-serif';
  ctx.fillText('Scan to join HyperGain', 124, H - 140);

  if (qrImg) {
    const q = 168;
    const qx = W - 56 - 24 - q;
    const qy = H - 320 + (240 - q) / 2;
    roundRect(ctx, qx - 8, qy - 8, q + 16, q + 16, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.drawImage(qrImg, qx, qy, q, q);
  }

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
      title: `HyperGain ${coin} trade`,
      text: `My ${coin} trade on HyperGain`,
    });
    return true;
  }
  downloadTradeSharePng(blob, coin);
  return false;
}
