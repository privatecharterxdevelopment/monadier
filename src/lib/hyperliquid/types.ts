export type HlInterval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M';

export type HlCandle = {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
};

export type HlBookLevel = {
  px: string;
  sz: string;
  n: number;
};

export type HlL2Book = {
  coin: string;
  time: number;
  levels: [HlBookLevel[], HlBookLevel[]];
};

export type HlAssetMeta = {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  isDelisted?: boolean;
};

export type HlAssetCtx = {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  markPx: string;
  midPx?: string;
  oraclePx?: string;
};

export type HlMarketSnapshot = {
  coin: string;
  markPx: number;
  midPx: number;
  oraclePx: number;
  prevDayPx: number;
  change24hPct: number;
  change24hAbs: number;
  fundingRate: number;
  dayVolumeUsd: number;
  openInterestUsd: number;
  maxLeverage: number;
};

export type HlRecentTrade = {
  coin: string;
  side: string;
  px: string;
  sz: string;
  time: number;
};

export type HlCandleBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};
