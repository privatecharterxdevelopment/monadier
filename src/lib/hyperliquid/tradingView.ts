import type { HlInterval } from './types';

const TV_SYMBOL_OVERRIDES: Record<string, string> = {
  BTC: 'BINANCE:BTCUSDT',
  ETH: 'BINANCE:ETHUSDT',
  SOL: 'BINANCE:SOLUSDT',
  DOGE: 'BINANCE:DOGEUSDT',
  AVAX: 'BINANCE:AVAXUSDT',
  LINK: 'BINANCE:LINKUSDT',
  ARB: 'BINANCE:ARBUSDT',
  OP: 'BINANCE:OPUSDT',
  SUI: 'BINANCE:SUIUSDT',
  WIF: 'BINANCE:WIFUSDT',
};

/**
 * HL-native — no liquid Binance USDT. External TV widget is blank/wrong for these.
 */
const TV_UNSUPPORTED_COINS = new Set([
  'CASHCAT',
  'PURR', // was wrongly mapped to BTCUSDT
  'KBONK',
  'KPEPE',
]);

const TV_INTERVAL: Partial<Record<HlInterval, string>> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
};

function coinBase(coin: string): string {
  const base = coin.split('/')[0]?.replace(/^@/, '') ?? coin;
  return base.toUpperCase().replace(/-PERP$/i, '');
}

export function isTradingViewSupported(coin: string): boolean {
  const upper = coinBase(coin);
  if (!upper) return false;
  if (TV_UNSUPPORTED_COINS.has(upper)) return false;
  if (TV_SYMBOL_OVERRIDES[upper]) return true;
  return /^[A-Z0-9]{2,12}$/.test(upper);
}

export function resolveTradingViewSymbol(coin: string): string {
  const upper = coinBase(coin);
  if (TV_SYMBOL_OVERRIDES[upper]) return TV_SYMBOL_OVERRIDES[upper];
  if (/^[A-Z0-9]{2,10}$/.test(upper)) return `BINANCE:${upper}USDT`;
  return 'BINANCE:BTCUSDT';
}

export function resolveTradingViewInterval(interval: HlInterval): string {
  return TV_INTERVAL[interval] ?? '60';
}
