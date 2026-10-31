const FAVORITES_KEY = 'monadier_pro_favorite_markets';
const RECENTS_KEY = 'monadier_pro_recent_markets';
const MAX_RECENTS = 8;

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
  } catch {
    return [];
  }
}

function writeList(key: string, values: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    /* storage full / private mode */
  }
}

export function loadFavoriteMarkets(): string[] {
  return readList(FAVORITES_KEY);
}

export function loadRecentMarkets(): string[] {
  return readList(RECENTS_KEY);
}

export function toggleFavoriteMarket(coin: string): string[] {
  const normalized = coin.trim();
  if (!normalized) return loadFavoriteMarkets();

  const current = loadFavoriteMarkets();
  const next = current.includes(normalized)
    ? current.filter((c) => c !== normalized)
    : [normalized, ...current];
  writeList(FAVORITES_KEY, next);
  return next;
}

export function recordRecentMarket(coin: string): string[] {
  const normalized = coin.trim();
  if (!normalized) return loadRecentMarkets();

  const next = [normalized, ...loadRecentMarkets().filter((c) => c !== normalized)].slice(
    0,
    MAX_RECENTS
  );
  writeList(RECENTS_KEY, next);
  return next;
}
