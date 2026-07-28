/**
 * Server-side win flyer PNG — matches browser HQ tradeShareCard (Montserrat + Open Sans).
 */
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
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
const H = 1080;
const SHARE_BRAND = 'hyperGain';
const FONT_DISPLAY = '"Montserrat", "DejaVu Sans", sans-serif';
const FONT_BODY = '"Open Sans", "DejaVu Sans", sans-serif';
const QR_APP_BASE = 'https://app.hypergain.io';

let fontsRegistered = false;

function registerFontsOnce(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;

  const assetDir = path.resolve(__dirname, '../../assets/fonts');
  const pairs: Array<[string, string]> = [
    ['Montserrat-SemiBold.ttf', 'Montserrat'],
    ['Montserrat-Bold.ttf', 'Montserrat'],
    ['Montserrat-ExtraBold.ttf', 'Montserrat'],
    ['OpenSans-Regular.ttf', 'Open Sans'],
    ['OpenSans-SemiBold.ttf', 'Open Sans'],
    ['OpenSans-Bold.ttf', 'Open Sans'],
  ];
  for (const [file, family] of pairs) {
    const p = path.join(assetDir, file);
    if (fs.existsSync(p)) {
      try {
        GlobalFonts.registerFromPath(p, family);
      } catch {
        /* ignore */
      }
    }
  }

  const dejavu = [
    '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  for (const p of dejavu) {
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
  if (n > 0) return `+$${body}`;
  if (n < 0) return `-$${body}`;
  return `$${body}`;
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

function setType(ctx: SKRSContext2D, weight: number, size: number, family: string) {
  const bold = weight >= 700 ? 'bold ' : weight >= 600 ? '600 ' : '';
  ctx.font = `${bold}${size}px ${family}`;
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

  const bg2 = ctx.createLinearGradient(0, 0, 0, H);
  bg2.addColorStop(0, '#f0f1f4');
  bg2.addColorStop(1, '#c5cad3');
  ctx.fillStyle = bg2;
  ctx.fillRect(0, 0, W, H);

  const pad = 40;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 28);
  ctx.fillStyle = '#f7f8fa';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,24,0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const ink = '#141418';
  const mute = '#5c606a';
  const soft = '#8a8f9a';
  const isProfit = input.closedPnlUsd >= 0;
  const accent = isProfit ? '#1a6b45' : '#a61e32';
  const sideColor = input.side === 'LONG' ? '#1a6b45' : '#a61e32';
  const left = pad + 44;
  const right = W - pad - 44;
  const contentW = right - left;

  setType(ctx, 700, 34, FONT_DISPLAY);
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(SHARE_BRAND, left, pad + 78);

  setType(ctx, 500, 13, FONT_BODY);
  ctx.fillStyle = soft;
  ctx.fillText('TRADE RESULT', left, pad + 102);

  const name = input.displayName.trim() || `${BRAND_NAME} trader`;
  const avatarX = left;
  const avatarY = pad + 130;
  const avatarR = 20;

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
    ctx.fillStyle = '#e6e8ee';
    ctx.fillRect(avatarX, avatarY, avatarR * 2, avatarR * 2);
    setType(ctx, 700, 15, FONT_DISPLAY);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 1).toUpperCase(), avatarX + avatarR, avatarY + avatarR + 0.5);
  }
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setType(ctx, 600, 18, FONT_BODY);
  ctx.fillStyle = ink;
  ctx.fillText(name, avatarX + avatarR * 2 + 14, avatarY + 18);
  setType(ctx, 400, 13, FONT_BODY);
  ctx.fillStyle = soft;
  ctx.fillText(fmtStamp(input.closedAtMs), avatarX + avatarR * 2 + 14, avatarY + 38);

  setType(ctx, 800, 52, FONT_DISPLAY);
  ctx.fillStyle = ink;
  ctx.fillText(`${input.coin} PERP`, left, pad + 250);

  const sideLabel = input.side === 'LONG' ? 'Long' : 'Short';
  setType(ctx, 600, 18, FONT_BODY);
  ctx.fillStyle = sideColor;
  ctx.fillText(sideLabel, left, pad + 282);
  const sideW = ctx.measureText(sideLabel).width;
  ctx.fillStyle = soft;
  ctx.fillText(`  ·  ${input.venueLabel ?? 'Hyperliquid Perp'}`, left + sideW, pad + 282);

  const pnlText = fmtMoney(input.closedPnlUsd);
  setType(ctx, 800, 78, FONT_DISPLAY);
  ctx.fillStyle = accent;
  ctx.fillText(pnlText, left, pad + 390);

  const roi = winFlyerRoiPct(input);
  if (roi) {
    setType(ctx, 600, 26, FONT_DISPLAY);
    ctx.fillStyle = accent;
    ctx.fillText(`${fmtPct(roi.pct)} ${roi.label}`, left, pad + 430);
  }

  ctx.strokeStyle = 'rgba(20,20,24,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, pad + 470);
  ctx.lineTo(right, pad + 470);
  ctx.stroke();

  const col2 = left + contentW / 2 + 12;
  const row1 = pad + 520;
  const row2 = pad + 610;
  const lev =
    input.leverage != null && input.leverage > 0 ? `${Math.round(input.leverage)}x` : '—';
  const cells = [
    { label: 'ENTRY', value: input.entryPrice != null ? fmtPx(input.entryPrice) : '—', x: left, y: row1 },
    { label: 'CLOSE', value: fmtPx(input.closePrice), x: col2, y: row1 },
    { label: 'SIZE', value: `${fmtPx(Math.abs(input.size))} ${input.coin}`, x: left, y: row2 },
    { label: 'LEVERAGE', value: lev, x: col2, y: row2 },
  ];
  for (const cell of cells) {
    setType(ctx, 600, 11, FONT_BODY);
    ctx.fillStyle = soft;
    ctx.fillText(cell.label, cell.x, cell.y);
    setType(ctx, 700, 28, FONT_DISPLAY);
    ctx.fillStyle = ink;
    ctx.fillText(cell.value, cell.x, cell.y + 36);
  }

  const footY = H - pad - 220;
  ctx.strokeStyle = 'rgba(20,20,24,0.1)';
  ctx.beginPath();
  ctx.moveTo(left, footY);
  ctx.lineTo(right, footY);
  ctx.stroke();

  const referralCode = String(input.referralCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const referralUrl = qrTargetUrl(referralCode, input.referralUrl);
  const q = 148;
  const qx = right - q;
  const qy = footY + 36;

  roundRect(ctx, qx - 10, qy - 10, q + 20, q + 20, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  roundRect(ctx, qx - 10, qy - 10, q + 20, q + 20, 14);
  ctx.strokeStyle = 'rgba(20,20,24,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  try {
    const dataUrl = await QRCode.toDataURL(referralUrl, {
      margin: 2,
      width: q * 2,
      color: { dark: '#141418', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
    const qrImg = await loadImage(dataUrl);
    ctx.drawImage(qrImg, qx, qy, q, q);
  } catch {
    /* leave white pad */
  }

  setType(ctx, 700, 22, FONT_DISPLAY);
  ctx.fillStyle = ink;
  ctx.fillText(SHARE_BRAND, left, footY + 56);
  setType(ctx, 400, 14, FONT_BODY);
  ctx.fillStyle = mute;
  ctx.fillText('Scan to join on Hyperliquid', left, footY + 84);
  setType(ctx, 600, 15, FONT_BODY);
  ctx.fillStyle = ink;
  ctx.fillText(referralCode || 'HYPERGAIN', left, footY + 120);
  setType(ctx, 400, 13, FONT_BODY);
  ctx.fillStyle = soft;
  ctx.fillText('app.hypergain.io', left, footY + 148);

  return canvas.toBuffer('image/png');
}
