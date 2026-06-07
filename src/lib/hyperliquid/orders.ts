import { formatHlPrice, formatHlSize } from './meta';
import type { HlAssetMeta } from './types';

export type OrderSide = 'long' | 'short';
export type SimpleOrderKind = 'limit' | 'market';
export type TpSlKind = 'tp' | 'sl';

export type HlOrderLeg = {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t:
    | { limit: { tif: 'Gtc' | 'FrontendMarket' } }
    | { trigger: { isMarket: boolean; triggerPx: string; tpsl: TpSlKind } };
};

export function marketLimitPrice(side: OrderSide, markPx: number): number {
  return side === 'long' ? markPx * 1.05 : markPx * 0.95;
}

export function buildSimpleOrderLeg(opts: {
  assetIndex: number;
  side: OrderSide;
  kind: SimpleOrderKind;
  size: number;
  price: number;
  markPx: number;
  meta: HlAssetMeta;
  reduceOnly?: boolean;
}): HlOrderLeg {
  const price = opts.kind === 'market' ? marketLimitPrice(opts.side, opts.markPx) : opts.price;
  return {
    a: opts.assetIndex,
    b: opts.side === 'long',
    p: formatHlPrice(price),
    s: formatHlSize(opts.size, opts.meta.szDecimals),
    r: opts.reduceOnly ?? false,
    t:
      opts.kind === 'market'
        ? { limit: { tif: 'FrontendMarket' } }
        : { limit: { tif: 'Gtc' } },
  };
}

export function buildScaleLegs(opts: {
  assetIndex: number;
  side: OrderSide;
  totalSize: number;
  startPrice: number;
  endPrice: number;
  orderCount: number;
  meta: HlAssetMeta;
}): HlOrderLeg[] {
  const count = Math.max(2, Math.min(20, Math.floor(opts.orderCount)));
  const sizeEach = opts.totalSize / count;
  const priceStep = (opts.endPrice - opts.startPrice) / (count - 1);

  return Array.from({ length: count }, (_, i) => {
    const price = opts.startPrice + priceStep * i;
    return buildSimpleOrderLeg({
      assetIndex: opts.assetIndex,
      side: opts.side,
      kind: 'limit',
      size: sizeEach,
      price,
      markPx: price,
      meta: opts.meta,
    });
  });
}

export function buildTriggerLeg(opts: {
  assetIndex: number;
  side: OrderSide;
  size: number;
  triggerPx: number;
  kind: TpSlKind;
  meta: HlAssetMeta;
  isMarket?: boolean;
}): HlOrderLeg {
  return {
    a: opts.assetIndex,
    b: opts.side === 'long',
    p: formatHlPrice(opts.triggerPx),
    s: formatHlSize(opts.size, opts.meta.szDecimals),
    r: true,
    t: {
      trigger: {
        isMarket: opts.isMarket ?? true,
        triggerPx: formatHlPrice(opts.triggerPx),
        tpsl: opts.kind,
      },
    },
  };
}

export function firstOrderError(statuses: unknown[]): string | null {
  for (const status of statuses) {
    if (status && typeof status === 'object' && 'error' in status) {
      const err = (status as { error?: string }).error;
      if (err) return String(err);
    }
  }
  return null;
}
