import type { HlInterval } from './types';

export const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
export const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';

/** Default market when Pro Trade loads */
export const DEFAULT_PRO_COIN = 'BTC';

/** Default spot market (top volume pair) */
export const DEFAULT_SPOT_COIN = '@109';

export const DEFAULT_SWAP_COIN = '@150';

/** Shown as quick picks in the market search (volume list is the full source of truth). */
export const PRO_TRADE_QUICK_PICKS = ['BTC', 'ETH', 'SOL'] as const;

export const PRO_TRADE_INTERVALS: { label: string; value: HlInterval }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1d', value: '1d' },
];

export const DEFAULT_PRO_INTERVAL: HlInterval = '1h';
