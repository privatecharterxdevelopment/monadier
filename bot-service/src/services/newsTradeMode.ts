export type NewsTradeMode = 'off' | 'filter' | 'boost';

export function normalizeNewsTradeMode(raw: string | null | undefined): NewsTradeMode {
  if (raw === 'boost' || raw === 'primary') return 'boost';
  if (raw === 'off') return 'off';
  return 'filter';
}
