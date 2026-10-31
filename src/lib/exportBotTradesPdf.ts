import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import type { HlUserFill } from './hyperliquid/user';
import { aggregateHlCloseFills } from './hyperliquid/hlFillAggregate';
import {
  fillPositionDirection,
  fmtClosedPnl,
  fmtFillAction,
  fmtPrice,
  fmtSize,
  hlFillResultLabel,
  isHlFillClose,
} from './hyperliquid/format';
import { toNum } from './hyperliquid/parse';
import { BRAND_NAME } from './brand';
import { getOpenAppPath } from './appUrls';

export type BotTradesPdfOptions = {
  fills: HlUserFill[];
  walletAddress: string;
  userId?: string | null;
  username?: string | null;
  displayName?: string | null;
};

export class BotTradesPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotTradesPdfError';
  }
}

const INK = [26, 26, 26] as const;
const MUTED = [82, 82, 90] as const;
const LINE = [220, 222, 228] as const;
const HEAD_BG = [242, 243, 246] as const;
const ROW_ALT = [250, 250, 252] as const;
const PNL_GREEN = [22, 163, 74] as const;
const PNL_RED = [220, 38, 38] as const;

/**
 * Live dashboard URL for PDF QR (app subdomain when split domains are on).
 */
const LIVE_APP_FALLBACK = 'https://app.hypergain.io';

/** QR target: same host the user exports from, else the live app entry. */
function pdfQrTargetUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/$/, '');
    const entry = getOpenAppPath();
    const path = entry === '/' ? '' : entry;
    return `${origin}${path}?section=bot`;
  }
  return `${LIVE_APP_FALLBACK}/?section=bot`;
}

function fmtPdfTime(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function drawBrandMark(doc: jsPDF, x: number, y: number, size = 7): void {
  doc.setFillColor(HEAD_BG[0], HEAD_BG[1], HEAD_BG[2]);
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, size, size, 1.2, 1.2, 'FD');
  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.45);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const arm = size * 0.28;
  doc.line(cx, cy - arm, cx, cy + arm);
  doc.line(cx - arm, cy, cx + arm, cy);
}

function pdfFilename(username?: string | null): string {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 10);
  const slug = username?.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '-');
  const brandSlug = BRAND_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return slug
    ? `${brandSlug}-bot-trades-${slug}-${stamp}.pdf`
    : `${brandSlug}-bot-trades-${stamp}.pdf`;
}

function accountLabel(opts: {
  username?: string | null;
  displayName?: string | null;
}): string | null {
  const username = opts.username?.trim();
  if (username) return `@${username}`;
  const name = opts.displayName?.trim();
  return name || null;
}

async function drawAppQr(
  doc: jsPDF,
  pageWidth: number,
  marginX: number,
  topY: number
): Promise<void> {
  const qrSize = 18;
  const x = pageWidth - marginX - qrSize;
  const targetUrl = pdfQrTargetUrl();
  const dataUrl = await QRCode.toDataURL(targetUrl, {
    margin: 1,
    width: 160,
    errorCorrectionLevel: 'M',
    color: { dark: '#1a1a1a', light: '#ffffff' },
  });
  doc.addImage(dataUrl, 'PNG', x, topY - 1, qrSize, qrSize);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text(`Scan · ${BRAND_NAME}`, x + qrSize / 2, topY - 1 + qrSize + 3.2, {
    align: 'center',
  });
}

export async function exportBotTradesPdf({
  fills,
  walletAddress,
  userId,
  username,
  displayName,
}: BotTradesPdfOptions): Promise<void> {
  const closeFills = aggregateHlCloseFills(
    fills.filter((f) => isHlFillClose(f.dir, f.closedPnl))
  );

  if (closeFills.length === 0) {
    throw new BotTradesPdfError('No closed trades to export.');
  }

  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;
    let y = 14;

    drawBrandMark(doc, marginX, y - 1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(BRAND_NAME, marginX + 9, y + 4.5);

    await drawAppQr(doc, pageWidth, marginX, y);

    y += 11;
    doc.setFontSize(12);
    doc.text('Bot trade history', marginX, y);

    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(INK[0], INK[1], INK[2]);

    const account = accountLabel({ username, displayName });
    if (account) {
      doc.text(`Account: ${account}`, marginX, y);
      y += 4.5;
    }
    if (userId?.trim()) {
      doc.text(`User ID: ${userId.trim()}`, marginX, y);
      y += 4.5;
    }
    doc.text(`Wallet: ${walletAddress}`, marginX, y);
    y += 4.5;
    doc.text(`Generated: ${fmtPdfTime(Date.now())}`, marginX, y);
    y += 4.5;
    doc.text(`Closed fills: ${closeFills.length}`, marginX, y);

    const netPnl = closeFills.reduce((sum, f) => sum + toNum(f.closedPnl), 0);
    y += 4.5;
    doc.setFont('helvetica', 'bold');
    if (netPnl > 0) doc.setTextColor(PNL_GREEN[0], PNL_GREEN[1], PNL_GREEN[2]);
    else if (netPnl < 0) doc.setTextColor(PNL_RED[0], PNL_RED[1], PNL_RED[2]);
    else doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(`Net closed P/L: ${fmtClosedPnl(netPnl)}`, marginX, y);
    doc.setTextColor(INK[0], INK[1], INK[2]);

    // Keep table clear of the QR block on the first page header.
    y = Math.max(y, 36);

    const head = [
      'Time',
      'Coin',
      'Action',
      'Side',
      'Size',
      'Price',
      'Fee',
      'Result',
      'Closed P/L',
    ];

    const body = closeFills.map((f) => [
      fmtPdfTime(f.time),
      f.coin,
      fmtFillAction(f.dir),
      fillPositionDirection(f),
      fmtSize(f.sz),
      fmtPrice(f.px),
      `$${toNum(f.fee).toFixed(4)}`,
      hlFillResultLabel(f.closedPnl) ?? '—',
      fmtClosedPnl(f.closedPnl),
    ]);

    autoTable(doc, {
      startY: y + 7,
      head: [head],
      body,
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
        textColor: INK,
        lineColor: LINE,
        lineWidth: 0.15,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: HEAD_BG,
        textColor: INK,
        fontStyle: 'bold',
        lineColor: LINE,
        lineWidth: 0.2,
      },
      alternateRowStyles: {
        fillColor: ROW_ALT,
      },
      bodyStyles: {
        fillColor: [255, 255, 255],
      },
      columnStyles: {
        0: { cellWidth: 30 },
        8: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: marginX, right: marginX },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        // Result (7) + Closed P/L (8) — green wins / red losses
        if (data.column.index !== 7 && data.column.index !== 8) return;
        const pnl = toNum(closeFills[data.row.index]?.closedPnl);
        if (pnl > 0) data.cell.styles.textColor = [...PNL_GREEN];
        else if (pnl < 0) data.cell.styles.textColor = [...PNL_RED];
      },
    });

    const finalY =
      (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(
      `${BRAND_NAME} · Hyperliquid perps fills from your connected wallet. Not financial advice.`,
      marginX,
      Math.min(finalY + 8, 285)
    );

    doc.save(pdfFilename(username));
  } catch (err) {
    if (err instanceof BotTradesPdfError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (/Failed to fetch dynamically imported module|MIME type|import/i.test(msg)) {
      throw new BotTradesPdfError(
        'PDF export failed — refresh the page (Cmd+Shift+R) and try again.'
      );
    }
    throw new BotTradesPdfError(msg || 'PDF export failed.');
  }
}
