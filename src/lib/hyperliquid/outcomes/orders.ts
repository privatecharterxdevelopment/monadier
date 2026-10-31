import type { HlOrderLeg } from '../orders';
import type { OutcomeOrderSide, OutcomeSideIndex } from './types';
import { outcomeAssetId } from './encoding';

export const OUTCOME_MIN_PRICE = 0.001;
export const OUTCOME_MAX_PRICE = 0.999;
export const OUTCOME_MIN_NOTIONAL_USD = 10;
export const OUTCOME_SZ_DECIMALS = 0;

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

export function validateOutcomeOrder(opts: {
  size: number;
  price: number;
}): string | null {
  if (!Number.isFinite(opts.size) || opts.size <= 0) return 'Enter a valid contract size';
  if (!Number.isInteger(opts.size)) return 'Outcome contracts must be whole numbers';
  if (!Number.isFinite(opts.price) || opts.price <= 0) return 'Enter a valid price';
  if (opts.price < OUTCOME_MIN_PRICE || opts.price > OUTCOME_MAX_PRICE) {
    return `Price must be between ${OUTCOME_MIN_PRICE} and ${OUTCOME_MAX_PRICE}`;
  }
  const notional = opts.size * opts.price;
  if (notional < OUTCOME_MIN_NOTIONAL_USD) {
    return `Minimum bet is $${OUTCOME_MIN_NOTIONAL_USD}`;
  }
  return null;
}

export function buildOutcomeOrderLeg(opts: {
  outcomeId: number;
  side: OutcomeSideIndex;
  orderSide: OutcomeOrderSide;
  size: number;
  price: number;
  kind: 'limit' | 'market';
  reduceOnly?: boolean;
}): HlOrderLeg {
  const validation = validateOutcomeOrder({ size: opts.size, price: opts.price });
  if (validation) throw new Error(validation);

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
