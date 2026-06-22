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

/** Open reason from bot marker — structured sections separated by ‖. */
export function formatHlBotOpenReason(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  if (text.includes(' ‖ ')) {
    return text
      .split(' ‖ ')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n');
  }
  return text;
}

export function isBotScanNoiseDetail(detail: string): boolean {
  const d = detail.trim();
  if (!d) return true;
  return (
    /HL perps scanned/i.test(d) ||
    /^\d+ passed/i.test(d) ||
    /no pair passed bot gates/i.test(d) ||
    /\d+\+?\s*conf,\s*2 aligned TFs/i.test(d) ||
    /Bot state out of sync/i.test(d) ||
    /Winning bot closes:/i.test(d) ||
    /Volume 0\.00x/i.test(d) ||
    / ‖ /.test(d) ||
    /15m \+?\d|1h \+?\d/i.test(d)
  );
}
