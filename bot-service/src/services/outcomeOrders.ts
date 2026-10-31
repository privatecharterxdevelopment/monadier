/** HIP-4 outcome order helpers — keep in sync with src/lib/hyperliquid/outcomes/orders.ts */

export const OUTCOME_ASSET_BASE = 100_000_000;
export const OUTCOME_MIN_PRICE = 0.001;
export const OUTCOME_MAX_PRICE = 0.999;
export const OUTCOME_MIN_NOTIONAL_USD = 10;

export type OutcomeSideIndex = 0 | 1;
export type OutcomeOrderSide = 'buy' | 'sell';

export type OutcomeOrderLeg = {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t: { limit: { tif: 'FrontendMarket' | 'Gtc' } };
};

export function outcomeEncoding(outcomeId: number, side: OutcomeSideIndex): number {
  return 10 * outcomeId + side;
}

export function outcomeAssetId(outcomeId: number, side: OutcomeSideIndex): number {
  return OUTCOME_ASSET_BASE + outcomeEncoding(outcomeId, side);
}

export function outcomeOrderCoin(outcomeId: number, side: OutcomeSideIndex): string {
  return `#${outcomeEncoding(outcomeId, side)}`;
}

export function outcomeBalanceCoin(outcomeId: number, side: OutcomeSideIndex): string {
  return `+${outcomeEncoding(outcomeId, side)}`;
}

export function clampOutcomePrice(price: number): number {
  return Math.min(OUTCOME_MAX_PRICE, Math.max(OUTCOME_MIN_PRICE, price));
}

export function formatOutcomePrice(price: number): string {
  const clamped = clampOutcomePrice(price);
  return clamped.toFixed(4).replace(/\.?0+$/, '') || '0';
}

export function formatOutcomeSize(size: number): string {
  const n = Math.floor(size);
  if (n <= 0) throw new Error('Outcome size must be a positive integer');
  return String(n);
}

export function outcomeMarketLimitPrice(side: OutcomeOrderSide, referencePx: number): number {
  const slip = 0.05;
  const px = side === 'buy' ? referencePx * (1 + slip) : referencePx * (1 - slip);
  return clampOutcomePrice(px);
}

export function buildOutcomeOrderLeg(opts: {
  outcomeId: number;
  side: OutcomeSideIndex;
  orderSide: OutcomeOrderSide;
  size: number;
  price: number;
  kind: 'limit' | 'market';
  reduceOnly?: boolean;
}): OutcomeOrderLeg {
  if (!Number.isFinite(opts.size) || opts.size <= 0 || !Number.isInteger(opts.size)) {
    throw new Error('Outcome size must be a positive integer');
  }
  if (!Number.isFinite(opts.price) || opts.price <= 0) {
    throw new Error('Invalid outcome price');
  }
  const notional = opts.size * opts.price;
  if (notional < OUTCOME_MIN_NOTIONAL_USD) {
    throw new Error(`Minimum bet is $${OUTCOME_MIN_NOTIONAL_USD}`);
  }

  const limitPx =
    opts.kind === 'market'
      ? outcomeMarketLimitPrice(opts.orderSide, opts.price)
      : clampOutcomePrice(opts.price);

  return {
    a: outcomeAssetId(opts.outcomeId, opts.side),
    b: opts.orderSide === 'buy',
    p: formatOutcomePrice(limitPx),
    s: formatOutcomeSize(opts.size),
    r: opts.reduceOnly ?? false,
    t:
      opts.kind === 'market'
        ? { limit: { tif: 'FrontendMarket' } }
        : { limit: { tif: 'Gtc' } },
  };
}
