import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { HlUserFill } from './hyperliquid/user';
import { isHlFillOpen } from './hyperliquid/format';
import {
  fillPositionDirection,
  fmtClosedPnl,
  fmtFillAction,
  fmtPrice,
  fmtSize,
  hlFillResultLabel,
} from './hyperliquid/format';
import { toNum } from './hyperliquid/parse';

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

function drawMonadierMark(doc: jsPDF, x: number, y: number, size = 7): void {
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
  return slug
    ? `monadier-bot-trades-${slug}-${stamp}.pdf`
    : `monadier-bot-trades-${stamp}.pdf`;
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

export async function exportBotTradesPdf({
  fills,
  walletAddress,
  userId,
  username,
  displayName,
}: BotTradesPdfOptions): Promise<void> {
  const closeFills = fills
    .filter((f) => !isHlFillOpen(f.dir))
    .sort((a, b) => b.time - a.time);

  if (closeFills.length === 0) {
    throw new BotTradesPdfError('No closed trades to export.');
  }

  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const marginX = 14;
    let y = 14;

    drawMonadierMark(doc, marginX, y - 1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text('monadier', marginX + 9, y + 4.5);

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
    doc.text(`Net closed P/L: ${fmtClosedPnl(netPnl)}`, marginX, y);

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
        8: { halign: 'right' },
      },
      margin: { left: marginX, right: marginX },
    });

    const finalY =
      (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(
      'Hyperliquid perps fills from your connected wallet. Not financial advice.',
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
