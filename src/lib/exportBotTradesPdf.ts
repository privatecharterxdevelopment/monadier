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
  closeReasonForFill?: (coin: string, fillTimeMs: number) => string | undefined;
};

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

function drawMonadierMark(
  doc: import('jspdf').jsPDF,
  x: number,
  y: number,
  size = 7
): void {
  doc.setFillColor(10, 10, 10);
  doc.roundedRect(x, y, size, size, 1.6, 1.6, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
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
  closeReasonForFill,
}: BotTradesPdfOptions): Promise<void> {
  const closeFills = fills
    .filter((f) => !isHlFillOpen(f.dir))
    .sort((a, b) => b.time - a.time);

  if (closeFills.length === 0) return;

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 14;
  let y = 14;

  drawMonadierMark(doc, marginX, y - 1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(10, 10, 10);
  doc.text('monadier', marginX + 9, y + 4.5);

  y += 12;
  doc.setFontSize(13);
  doc.text('Bot trade history', marginX, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);

  const account = accountLabel({ username, displayName });
  if (account) {
    doc.text(`Account: ${account}`, marginX, y);
    y += 4;
  }
  if (userId?.trim()) {
    doc.text(`User ID: ${userId.trim()}`, marginX, y);
    y += 4;
  }
  doc.text(`Wallet: ${walletAddress}`, marginX, y);
  y += 4;
  doc.text(`Generated: ${fmtPdfTime(Date.now())}`, marginX, y);
  y += 4;
  doc.text(`Closed fills: ${closeFills.length}`, marginX, y);

  const netPnl = closeFills.reduce((sum, f) => sum + toNum(f.closedPnl), 0);
  y += 4;
  doc.setFont('helvetica', 'bold');
  const pnlRgb = netPnl >= 0 ? ([16, 120, 72] as const) : ([200, 48, 48] as const);
  doc.setTextColor(pnlRgb[0], pnlRgb[1], pnlRgb[2]);
  doc.text(`Net closed P/L: ${fmtClosedPnl(netPnl)}`, marginX, y);

  const includeWhy = Boolean(closeReasonForFill);
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
    ...(includeWhy ? ['Why'] : []),
  ];

  const body = closeFills.map((f) => {
    const result = hlFillResultLabel(f.closedPnl) ?? '—';
    const row = [
      fmtPdfTime(f.time),
      f.coin,
      fmtFillAction(f.dir),
      fillPositionDirection(f),
      fmtSize(f.sz),
      fmtPrice(f.px),
      `$${toNum(f.fee).toFixed(4)}`,
      result,
      fmtClosedPnl(f.closedPnl),
    ];
    if (includeWhy) {
      row.push(closeReasonForFill!(f.coin, f.time) ?? '—');
    }
    return row;
  });

  autoTable(doc, {
    startY: y + 6,
    head: [head],
    body,
    styles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [10, 10, 10],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: includeWhy
      ? { 0: { cellWidth: 28 }, 9: { cellWidth: 32 } }
      : { 0: { cellWidth: 30 } },
    margin: { left: marginX, right: marginX },
  });

  const finalY =
    (doc as import('jspdf').jsPDF & { lastAutoTable?: { finalY: number } })
      .lastAutoTable?.finalY ?? y + 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(
    'Hyperliquid perps fills from your connected wallet. Not financial advice.',
    marginX,
    Math.min(finalY + 8, 285)
  );

  doc.save(pdfFilename(username));
}
