/** True when close was user/ops manual (not bot trail/TP). */
export function isManualCloseReason(code: string | null | undefined): boolean {
  const key = code?.trim().toLowerCase() ?? '';
  if (!key) return false;
  const base = key.split(' ‖ ')[0]?.trim() ?? key;
  return (
    base === 'manual' ||
    base === 'user_requested' ||
    base.startsWith('manual') ||
    base.startsWith('user_') ||
    base.startsWith('ops_') ||
    base.startsWith('admin_')
  );
}

/** Short leaderboard pill label for a close reason. */
export function leaderboardCloseLabel(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  if (isManualCloseReason(code)) return 'Manual';
  const key = code.trim().toLowerCase().split(' ‖ ')[0] ?? '';
  if (key.includes('trailing') || key === 'trailing_stop') return 'Trail';
  if (key.includes('profit_lock') || key.includes('peak') || key.includes('profit_grab'))
    return 'Trail';
  if (key.includes('take_profit')) return 'TP';
  if (key.includes('stop_loss')) return 'SL';
  if (key.includes('signal_reversal')) return 'Reversal';
  return null;
}

/** Human-readable bot close reason (matches bot-service hlTrading closeMarketPosition). */
export function formatHlBotCloseReason(code: string | null | undefined): string | null {
  const raw = code?.trim();
  if (!raw) return null;

  if (raw.includes(' ‖ ')) {
    return raw
      .split(' ‖ ')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n');
  }

  const key = raw.toLowerCase();
  const map: Record<string, string> = {
    trailing_stop: 'Dynamic trailing stop — price crossed ATR trail (never red after arm)',
    profit_lock: 'Legacy profit lock',
    profit_grab_peak: 'Peak profit retraced — bot took the gain',
    profit_grab_timeout: 'Held in profit long enough — bot closed green',
    breakeven_scratch: 'Was green once — bot closed at breakeven (no red hold)',
    stop_loss: 'Stop loss on margin — cut the loser',
    signal_reversal: 'Macro/MTF flipped against the position — closed before deeper loss',
    take_profit: 'Take profit target reached',
    manual: 'Manual close from the app',
    user_requested: 'You closed this position',
    bot_stopped: 'Bot stopped — position closed on next cycle',
  };

  if (map[key]) return map[key];
  if (key.includes('signal_reversal')) return raw.replace(/_/g, ' ');
  if (key.includes('profit')) return `Closed for profit: ${raw.replace(/_/g, ' ')}`;
  if (key.includes('stop')) return `Closed on stop: ${raw.replace(/_/g, ' ')}`;
  if (raw.length > 48) return raw.slice(0, 400);
  return raw.replace(/_/g, ' ');
}

export type TradeReasonSection = {
  label?: string;
  text: string;
};

/** Split bot open/close audit into labeled rows for the hover box. */
export function parseTradeReasonSections(raw: string | null | undefined): TradeReasonSection[] {
  const text = raw?.trim();
  if (!text) return [];

  const chunks = text.includes(' ‖ ')
    ? text.split(' ‖ ').map((s) => s.trim()).filter(Boolean)
    : text.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  return chunks.map((line) => {
    const section = line.match(/^──\s*(.+?)\s*──\s*(.+)$/);
    if (section) {
      return { label: section[1].trim(), text: section[2].trim() };
    }

    const macroVs = line.match(/^(Macro vs [^:]+):\s*(.+)$/i);
    if (macroVs) {
      return { label: macroVs[1].trim(), text: macroVs[2].trim() };
    }

    const labeled = line.match(/^([A-Za-z][A-Za-z /]+):\s*(.+)$/);
    if (labeled && labeled[1].length <= 32) {
      return { label: labeled[1].trim(), text: labeled[2].trim() };
    }

    return { text: line };
  });
}

/** Open reason audit — internal only; not shown in user UI. */
export function formatHlBotOpenReason(_raw: string | null | undefined): string | null {
  return null;
}

/** User must act — shown under bot scan title; everything else is hidden. */
export function isActionableBotScanDetail(detail: string): boolean {
  const d = detail.trim();
  if (!d) return false;
  if (/Emergency-SL|Profit-SL idle|meets entry rules|no HL pair/i.test(d)) return false;
  return (
    /insufficient margin/i.test(d) ||
    /trading agent/i.test(d) ||
    /Approve the (Hyperliquid|trading agent)/i.test(d) ||
    /platform fee/i.test(d) ||
    /Bot fees due/i.test(d) ||
    /Pay fees/i.test(d) ||
    /Must deposit/i.test(d) ||
    /Deposit USDC/i.test(d) ||
    /At least \$[\d.]+ USDC/i.test(d) ||
    /Trade size below/i.test(d) ||
    /notional below/i.test(d) ||
    /HL balance \$[\d.]+\s*—\s*need/i.test(d) ||
    /Start bot to scan/i.test(d)
  );
}

export function isBotScanNoiseDetail(detail: string): boolean {
  const d = detail.trim();
  if (!d) return true;
  if (isActionableBotScanDetail(d)) return false;
  const parts = d.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => isBotScanNoiseDetail(p))) return true;
  return (
    /HL perps scanned/i.test(d) ||
    /^\d+ passed/i.test(d) ||
    /no pair passed bot gates/i.test(d) ||
    /\d+\+?\s*conf,\s*2 aligned TFs/i.test(d) ||
    /Bot state out of sync/i.test(d) ||
    /Winning bot closes:/i.test(d) ||
    /Volume 0\.00x/i.test(d) ||
    /Checking your Hyperliquid balance/i.test(d) ||
    /HL balance check failed/i.test(d) ||
    /Could not read Hyperliquid balance/i.test(d) ||
    /HL account equity/i.test(d) ||
    /free margin \$0\.00 · perp/i.test(d) ||
    /Waiting for pullback to buy low/i.test(d) ||
    / ‖ /.test(d) ||
    /No HL pair meets entry rules/i.test(d) ||
    /no HL pair passed the global scan/i.test(d) ||
    /Emergency-SL not confirmed/i.test(d) ||
    /Profit-SL idle/i.test(d) ||
    /(\d+)\+% confidence,\s*\d+\/3 timeframes aligned/i.test(d) ||
    /^Slot \d+:/i.test(d) ||
    /% — 6×1m/i.test(d) ||
    /^6×1m/i.test(d) ||
    /lower closes/i.test(d) ||
    /mom -?\d/i.test(d) ||
    /next3 (UP|DOWN)/i.test(d) ||
    /Scanned \d+ HL perps/i.test(d) ||
    /Rotating scan/i.test(d) ||
    /Scanning all HL perps/i.test(d) ||
    /tradeable setup/i.test(d) ||
    /below \d+% threshold/i.test(d) ||
    /independent pair/i.test(d) ||
    /MTF on chart pair/i.test(d) ||
    /macro filters removed/i.test(d) ||
    /Checking \w+:/i.test(d) ||
    /timeframes disagree/i.test(d)
  );
}

/** Strip internal scan suffixes from bot reason strings before UI display. */
export function sanitizeBotScanReason(reason: string): string {
  return reason
    .replace(/\s*·\s*major SHORT fallback[^\n·]*/gi, '')
    .replace(/\s*·\s*major (LONG|SHORT) fallback[^\n·]*/gi, '')
    .replace(/\s*·\s*relaxed scan[^\n·]*/gi, '')
    .replace(/\s*·\s*top-pairs fallback[^\n·]*/gi, '')
    .trim();
}
