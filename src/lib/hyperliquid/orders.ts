import { formatHlPrice, formatHlSize, formatHlCloseSize } from './meta';
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
    p: formatHlPrice(price, opts.meta.szDecimals),
    s: (opts.reduceOnly ? formatHlCloseSize : formatHlSize)(opts.size, opts.meta.szDecimals),
    r: opts.reduceOnly ?? false,
    t:
      opts.kind === 'market'
        ? { limit: { tif: 'FrontendMarket' } }
        : { limit: { tif: 'Gtc' } },
  };
}

function scaleSizeWeights(count: number, skew: number): number[] {
  if (count <= 1) return [1];
  const s = Math.max(0.01, Math.min(100, skew));
  const weights = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return Math.pow(s, t);
  });
  const sum = weights.reduce((acc, w) => acc + w, 0);
  return weights.map((w) => w / sum);
}

export function buildScaleLegs(opts: {
  assetIndex: number;
  side: OrderSide;
  totalSize: number;
  startPrice: number;
  endPrice: number;
  orderCount: number;
  sizeSkew?: number;
  meta: HlAssetMeta;
}): HlOrderLeg[] {
  const count = Math.max(2, Math.min(20, Math.floor(opts.orderCount)));
  const weights = scaleSizeWeights(count, opts.sizeSkew ?? 1);
  const priceStep = (opts.endPrice - opts.startPrice) / (count - 1);

  return Array.from({ length: count }, (_, i) => {
    const price = opts.startPrice + priceStep * i;
    return buildSimpleOrderLeg({
      assetIndex: opts.assetIndex,
      side: opts.side,
      kind: 'limit',
      size: opts.totalSize * weights[i],
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
    p: formatHlPrice(opts.triggerPx, opts.meta.szDecimals),
    s: formatHlSize(opts.size, opts.meta.szDecimals),
    r: true,
    t: {
      trigger: {
        isMarket: opts.isMarket ?? true,
        triggerPx: formatHlPrice(opts.triggerPx, opts.meta.szDecimals),
        tpsl: opts.kind,
      },
    },
  };
}

/** Pull HL order status rows from exchange client responses (shape varies by SDK version). */
export function extractOrderStatuses(result: unknown): unknown[] {
  if (!result || typeof result !== 'object') return [];

  const root = result as Record<string, unknown>;
  if (Array.isArray(root.statuses)) return root.statuses;

  const response = root.response;
  if (!response || typeof response !== 'object') return [];

  const resp = response as Record<string, unknown>;
  if (Array.isArray(resp.statuses)) return resp.statuses;

  const data = resp.data;
  if (data && typeof data === 'object') {
    const statuses = (data as Record<string, unknown>).statuses;
    if (Array.isArray(statuses)) return statuses;
  }

  return [];
}

export function firstOrderError(statuses: unknown): string | null {
  if (!Array.isArray(statuses)) {
    if (statuses && typeof statuses === 'object' && 'error' in statuses) {
      const err = (statuses as { error?: unknown }).error;
      if (err) return String(err);
    }
    return null;
  }

  for (const status of statuses) {
    if (status && typeof status === 'object' && 'error' in status) {
      const err = (status as { error?: string }).error;
      if (err) return String(err);
    }
  }
  return null;
}

export function orderResponseError(result: unknown): string | null {
  if (result && typeof result === 'object') {
    const top = (result as { error?: unknown }).error;
    if (top) return String(top);
  }
  return firstOrderError(extractOrderStatuses(result));
}

/** Outcome of a successful HL order batch (no error statuses). */
export type OrderPlacementOutcome = 'filled' | 'resting' | 'mixed' | 'submitted';

export function classifyOrderPlacement(result: unknown): OrderPlacementOutcome {
  const statuses = extractOrderStatuses(result);
  if (statuses.length === 0) return 'submitted';

  let filled = 0;
  let resting = 0;
  for (const status of statuses) {
    if (!status || typeof status !== 'object') continue;
    const row = status as Record<string, unknown>;
    if (row.filled != null) filled += 1;
    else if (row.resting != null) resting += 1;
  }

  if (filled > 0 && resting > 0) return 'mixed';
  if (filled > 0) return 'filled';
  if (resting > 0) return 'resting';
  return 'submitted';
}

/** Map raw Hyperliquid / wallet errors to short user-facing toasts. */
export function humanizeHlTradeError(raw: string): string {
  const msg = (raw || '').replace(/\s*-\s*null\s*$/i, '').trim();
  if (!msg) return 'Order failed';
  if (/insufficient.*margin|not enough.*margin|margin.*insufficient|Insufficient margin/i.test(msg)) {
    return 'Insufficient margin — reduce size or deposit USDC.';
  }
  if (/insufficient.*balance|not enough.*balance|balance.*insufficient/i.test(msg)) {
    return 'Insufficient balance for this order.';
  }
  if (/liquidity|could not.*match|would not immediately|Unable to fill|no liquidity/i.test(msg)) {
    return 'Not enough liquidity — try a smaller size or a different price.';
  }
  if (/minimum|Order must have minimum|too small|Invalid size/i.test(msg)) {
    return 'Order size too small for this market.';
  }
  if (/reduce.?only/i.test(msg)) {
    return 'Reduce-only rejected — no matching open position.';
  }
  if (/Price too far|oracle|slippage/i.test(msg)) {
    return 'Price rejected by Hyperliquid — refresh mark and retry.';
  }
  return msg;
}
