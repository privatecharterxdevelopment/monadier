/**
 * Server-side win flyer PNG (mirrors browser tradeShareCard look).
 * Soft silver gradient, minimal layout, robust QR.
 */
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import QRCode from 'qrcode';
import fs from 'fs';
import { BRAND_NAME } from '../brand';

export type WinFlyerInput = {
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
  leverage?: number | null;
  referralUrl: string;
};

const W = 720;
const H = 980;
const SHARE_BRAND = 'hyperGain';
const FONT = '"DejaVu Sans", "Noto Sans", sans-serif';
const QR_APP_BASE = 'https://app.hypergain.io';

let fontsRegistered = false;

function registerFontsOnce(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  const candidates = [
    '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
  ];
  const boldCandidates = [
    '/usr/share/fonts/ttf-dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        GlobalFonts.registerFromPath(p, 'DejaVu Sans');
      } catch {
        /* ignore */
      }
      break;
    }
  }
  for (const p of boldCandidates) {
    if (fs.existsSync(p)) {
      try {
        GlobalFonts.registerFromPath(p, 'DejaVu Sans');
      } catch {
        /* ignore */
      }
      break;
    }
  }
}

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
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 6;
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

export function winFlyerRoiPct(input: {
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

function roundRect(
  ctx: SKRSContext2D,
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

function setType(ctx: SKRSContext2D, weight: number, size: number) {
  const bold = weight >= 700 ? 'bold ' : '';
  ctx.font = `${bold}${size}px ${FONT}`;
}

function qrTargetUrl(referralCode: string, fallbackUrl?: string): string {
  const code = String(referralCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (code) return `${QR_APP_BASE}/?ref=${encodeURIComponent(code)}`;
  if (fallbackUrl && /^https:\/\//i.test(fallbackUrl)) return fallbackUrl;
  return `${QR_APP_BASE}/`;
}

export async function renderWinFlyerPng(input: WinFlyerInput): Promise<Buffer> {
  registerFontsOnce();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

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
  const isProfit = input.closedPnlUsd >= 0;
  const accent = isProfit ? '#1f7a4d' : '#b42338';
  const sideColor = input.side === 'LONG' ? '#1f7a4d' : '#b42338';

  setType(ctx, 700, 36);
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(SHARE_BRAND, 56, 72);

  const name = input.displayName.trim() || `${BRAND_NAME} trader`;
  const avatarX = 56;
  const avatarY = 108;
  const avatarR = 18;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  let drewAvatar = false;
  if (input.avatarUrl) {
    try {
      const avatar = await loadImage(input.avatarUrl);
      ctx.drawImage(avatar, avatarX, avatarY, avatarR * 2, avatarR * 2);
      drewAvatar = true;
    } catch {
      /* fall through */
    }
  }
  if (!drewAvatar) {
    ctx.fillStyle = 'rgba(26,26,30,0.08)';
    ctx.fillRect(avatarX, avatarY, avatarR * 2, avatarR * 2);
    setType(ctx, 700, 14);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 1).toUpperCase(), avatarX + avatarR, avatarY + avatarR + 0.5);
  }
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setType(ctx, 600, 18);
  ctx.fillStyle = ink;
  ctx.fillText(name, avatarX + avatarR * 2 + 12, avatarY + 16);
  setType(ctx, 500, 13);
  ctx.fillStyle = soft;
  ctx.fillText(fmtStamp(input.closedAtMs), avatarX + avatarR * 2 + 12, avatarY + 36);

  setType(ctx, 700, 48);
  ctx.fillStyle = ink;
  ctx.fillText(`${input.coin} PERP`, 56, 240);

  const sideLabel = input.side === 'LONG' ? 'Long' : 'Short';
  setType(ctx, 600, 20);
  ctx.fillStyle = sideColor;
  ctx.fillText(sideLabel, 56, 276);
  const sideW = ctx.measureText(sideLabel).width;
  ctx.fillStyle = soft;
  ctx.fillText(`  ·  ${input.venueLabel ?? 'Hyperliquid'}`, 56 + sideW, 276);

  const pnlText = fmtMoney(input.closedPnlUsd);
  setType(ctx, 800, 88);
  ctx.fillStyle = accent;
  ctx.fillText(pnlText, 56, 400);
  const pnlW = ctx.measureText(pnlText).width;
  setType(ctx, 600, 28);
  ctx.fillStyle = mute;
  ctx.fillText('USD', 56 + pnlW + 12, 400);

  const roi = winFlyerRoiPct(input);
  if (roi) {
    setType(ctx, 600, 28);
    ctx.fillStyle = accent;
    const pct = fmtPct(roi.pct);
    ctx.fillText(pct, 56, 446);
    const pctW = ctx.measureText(pct).width;
    setType(ctx, 500, 14);
    ctx.fillStyle = soft;
    ctx.fillText(roi.label === 'ROE' ? 'ROE' : 'MOVE', 56 + pctW + 10, 446);
  }

  ctx.strokeStyle = 'rgba(26,26,30,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 500);
  ctx.lineTo(W - 56, 500);
  ctx.stroke();

  setType(ctx, 500, 12);
  ctx.fillStyle = soft;
  ctx.fillText('ENTRY', 56, 548);
  ctx.fillText('CLOSE', 360, 548);
  setType(ctx, 700, 30);
  ctx.fillStyle = ink;
  ctx.fillText(input.entryPrice != null ? fmtPx(input.entryPrice) : '—', 56, 592);
  ctx.fillText(fmtPx(input.closePrice), 360, 592);

  setType(ctx, 500, 15);
  ctx.fillStyle = mute;
  const levLabel =
    input.leverage != null && input.leverage > 0 ? ` · ${Math.round(input.leverage)}x` : '';
  ctx.fillText(`Size ${fmtPx(Math.abs(input.size))} ${input.coin}${levLabel}`, 56, 640);

  ctx.strokeStyle = 'rgba(26,26,30,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 690);
  ctx.lineTo(W - 56, 690);
  ctx.stroke();

  const q = 168;
  const qx = W - 56 - q;
  const qy = 730;
  const referralUrl = qrTargetUrl(input.referralCode, input.referralUrl);

  ctx.beginPath();
  roundRect(ctx, qx - 12, qy - 12, q + 24, q + 24, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(26,26,30,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  try {
    const dataUrl = await QRCode.toDataURL(referralUrl, {
      margin: 2,
      width: q * 2,
      color: { dark: '#111113', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
    const qrImg = await loadImage(dataUrl);
    ctx.drawImage(qrImg, qx, qy, q, q);
  } catch {
    setType(ctx, 500, 13);
    ctx.fillStyle = mute;
    ctx.textAlign = 'center';
    ctx.fillText('app.hypergain.io', qx + q / 2, qy + q / 2);
    ctx.textAlign = 'left';
  }

  setType(ctx, 700, 22);
  ctx.fillStyle = ink;
  ctx.fillText(SHARE_BRAND, 56, qy + 36);
  setType(ctx, 500, 15);
  ctx.fillStyle = soft;
  ctx.fillText('Scan to join', 56, qy + 64);
  setType(ctx, 600, 16);
  ctx.fillStyle = mute;
  ctx.fillText(input.referralCode, 56, qy + 98);
  setType(ctx, 500, 13);
  ctx.fillStyle = soft;
  ctx.fillText('app.hypergain.io', 56, qy + 128);

  return canvas.toBuffer('image/png');
}
