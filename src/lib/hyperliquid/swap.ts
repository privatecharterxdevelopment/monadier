import { toNum } from './parse';
import type { HlL2Book } from './types';

export type SwapDirection = 'buyUsde' | 'sellUsde';

export type SwapQuote = {
  amountIn: number;
  estimatedOut: number;
  minOut: number;
  executionPx: number;
  priceImpactBps: number;
  slippageBps: number;
};

function walkBook(
  levels: { px: string; sz: string }[],
  amountIn: number,
  mode: 'buyBase' | 'sellBase'
): { out: number; avgPx: number } {
  let remaining = amountIn;
  let received = 0;
  let spent = 0;

  for (const level of levels) {
    const px = toNum(level.px);
    const sz = toNum(level.sz);
    if (px <= 0 || sz <= 0) continue;

    if (mode === 'buyBase') {
      const levelCost = sz * px;
      if (remaining <= levelCost) {
        const base = remaining / px;
        received += base;
        spent += remaining;
        remaining = 0;
        break;
      }
      received += sz;
      spent += levelCost;
      remaining -= levelCost;
    } else {
      if (remaining <= sz) {
        received += remaining * px;
        spent += remaining;
        remaining = 0;
        break;
      }
      received += sz * px;
      spent += sz;
      remaining -= sz;
    }
  }

  if (spent <= 0) return { out: 0, avgPx: 0 };
  const avgPx = mode === 'buyBase' ? spent / received : received / spent;
  return { out: mode === 'buyBase' ? received : received, avgPx };
}

/** Estimate stablecoin swap output from HL order book (USDE/USDC). */
export function estimateSwapQuote(opts: {
  direction: SwapDirection;
  amountIn: number;
  markPx: number;
  book: HlL2Book | null;
  slippageBps?: number;
}): SwapQuote | null {
  const amountIn = opts.amountIn;
  if (!Number.isFinite(amountIn) || amountIn <= 0) return null;

  const slippageBps = opts.slippageBps ?? 10;
  const bids = opts.book?.levels?.[0] ?? [];
  const asks = opts.book?.levels?.[1] ?? [];
  const markPx = opts.markPx;

  let estimatedOut = 0;
  let executionPx = markPx;

  if (opts.direction === 'buyUsde') {
    const walked = walkBook(asks, amountIn, 'buyBase');
    if (walked.out > 0) {
      estimatedOut = walked.out;
      executionPx = walked.avgPx > 0 ? walked.avgPx : markPx;
    } else if (markPx > 0) {
      estimatedOut = amountIn / markPx;
      executionPx = markPx;
    }
  } else {
    const walked = walkBook(bids, amountIn, 'sellBase');
    if (walked.out > 0) {
      estimatedOut = walked.out;
      executionPx = walked.avgPx;
    } else if (markPx > 0) {
      estimatedOut = amountIn * markPx;
      executionPx = markPx;
    }
  }

  if (estimatedOut <= 0) return null;

  const refPx = markPx > 0 ? markPx : executionPx;
  const refOut =
    opts.direction === 'buyUsde'
      ? refPx > 0
        ? amountIn / refPx
        : 0
      : amountIn * refPx;
  const priceImpactBps =
    refOut > 0 ? Math.abs((estimatedOut - refOut) / refOut) * 10_000 : 0;
  const minOut = estimatedOut * (1 - slippageBps / 10_000);

  return {
    amountIn,
    estimatedOut,
    minOut,
    executionPx,
    priceImpactBps,
    slippageBps,
  };
}
