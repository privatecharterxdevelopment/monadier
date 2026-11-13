/** User-facing copy for a bot open that was gated after a high-confidence scan. */

export type HlOpenBlockLike = {
  coin?: string | null;
  direction?: string | null;
  gate?: string | null;
  reason?: string | null;
  recorded_at?: string | null;
  confidence?: number | null;
};

const STALE_MS = 30 * 60_000;

export function formatOpenBlockReason(block: HlOpenBlockLike): string {
  const coin = (block.coin || 'This pair').toUpperCase();
  const dir = (block.direction || '').toUpperCase();
  const conf =
    block.confidence != null && Number.isFinite(block.confidence)
      ? `${Math.round(block.confidence)}% `
      : '';
  const gate = String(block.gate || '').toLowerCase();
  const reason = String(block.reason || '');

  const prefix = `${coin}${dir ? ` ${dir}` : ''} ${conf}signal — not opening:`;

  if (/entry_location_quality|entry_location/.test(gate) || /support|floor|range pos|INTO_SUPPORT|EXTREME_LOCATION/i.test(reason)) {
    return `${prefix} price is sitting on support / range low. Confidence is the scan, not a fill.`;
  }
  if (/candle_wick|LOWER_WICK|hammer|absorption/i.test(`${gate} ${reason}`)) {
    return `${prefix} bounce wick at the low — waiting for the bounce to fail.`;
  }
  if (/scalp_align/i.test(gate)) {
    return `${prefix} 1m/5m not aligned with the stack yet.`;
  }
  if (/entry_momentum/i.test(gate)) {
    return `${prefix} 15m momentum not confirmed.`;
  }
  if (/pump_sweep|pump_short|fresh_pump/i.test(gate)) {
    return `${prefix} pump/sweep gate — waiting for a cleaner short.`;
  }
  if (/anti_flip/i.test(gate)) {
    return `${prefix} same-coin cooldown after the last trade.`;
  }
  if (/margin|notional/i.test(gate) || /margin|notional/i.test(reason)) {
    return `${prefix} not enough free margin for this size.`;
  }
  if (/wick/i.test(reason)) {
    return `${prefix} candle wick gate.`;
  }
  const short = reason.replace(/\s+/g, ' ').trim().slice(0, 160);
  return short ? `${prefix} ${short}` : `${prefix} a pre-trade gate blocked the fill.`;
}

export function pickFreshOpenBlock(
  blocks: HlOpenBlockLike[] | null | undefined,
  coin: string | null | undefined,
  now = Date.now()
): HlOpenBlockLike | null {
  if (!blocks?.length) return null;
  const want = coin?.replace(/USDT$/i, '').toUpperCase();
  const fresh = blocks.filter((b) => {
    const at = b.recorded_at ? Date.parse(b.recorded_at) : NaN;
    if (Number.isFinite(at) && now - at > STALE_MS) return false;
    return true;
  });
  if (fresh.length === 0) return null;
  if (want) {
    const match = fresh.find(
      (b) => String(b.coin || '').replace(/USDT$/i, '').toUpperCase() === want
    );
    return match ?? null;
  }
  return fresh[0] ?? null;
}
