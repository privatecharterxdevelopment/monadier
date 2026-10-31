export type NewsTradeMode = 'off' | 'filter' | 'boost';

export const NEWS_TRADE_MODE_LABELS: Record<NewsTradeMode, string> = {
  off: 'Off',
  filter: 'Filter',
  boost: 'Boost',
};

export const NEWS_TRADE_MODE_HINTS: Record<NewsTradeMode, string> = {
  off: 'Only blocks critical macro shocks (war, attacks). News shown in feed only.',
  filter: 'Bot blocks LONG/SHORT when news conflicts — includes BTC & ETH on heavy macro.',
  boost: 'Filter plus extra confidence when news aligns with the trade direction.',
};

export function normalizeNewsTradeMode(raw: string | null | undefined): NewsTradeMode {
  if (raw === 'boost' || raw === 'primary') return 'boost';
  if (raw === 'off') return 'off';
  return 'filter';
}
