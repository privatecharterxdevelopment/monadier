import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import {
  coinToAssetIndex,
  fetchHlMeta,
  formatHlCloseSize,
  formatHlPrice,
} from './hlInfo';

const transport = new HttpTransport();

type PostedStop = { px: number; at: number };
const lastPosted = new Map<string, PostedStop>();

function clientFor(userAddress: string): ExchangeClient {
  return new ExchangeClient({
    transport,
    wallet: deriveUserHlAgent(userAddress),
  });
}

/** True if the trigger is on the profit side of entry and not glued to mark. */
export function protectiveSideOk(
  direction: 'LONG' | 'SHORT',
  stopPx: number,
  markPx: number,
  entryPx: number
): boolean {
  if (!(stopPx > 0) || !(markPx > 0) || !(entryPx > 0)) return false;
  const minAway = markPx * 0.0012;
  if (direction === 'LONG') {
    // SL below mark, strictly above entry (never a red trigger).
    return stopPx < markPx - minAway && stopPx > entryPx;
  }
  // SHORT: strictly below entry, above mark — 1.005× entry used to allow a red SL.
  return stopPx > markPx + minAway && stopPx < entryPx;
}

/** Market SL slippage can eat a 10–20¢ leftover. Need real lock before posting. */
export function profitStopSafeToPost(opts: {
  direction: 'LONG' | 'SHORT';
  stopPx: number;
  markPx: number;
  entryPx: number;
  absSize: number;
  minLockUsd: number;
}): boolean {
  if (!protectiveSideOk(opts.direction, opts.stopPx, opts.markPx, opts.entryPx)) {
    return false;
  }
  if (!(opts.absSize > 0)) return false;
  const lockUsd =
    opts.direction === 'LONG'
      ? (opts.stopPx - opts.entryPx) * opts.absSize
      : (opts.entryPx - opts.stopPx) * opts.absSize;
  return lockUsd >= Math.max(1.25, opts.minLockUsd);
}

/**
 * Push the in-profit software trail onto Hyperliquid as a reduce-only SL
 * so the book actually shows a stop instead of a naked position.
 */
export async function syncHlProfitStopOrder(opts: {
  userAddress: `0x${string}`;
  coin: string;
  direction: 'LONG' | 'SHORT';
  absSize: number;
  markPrice: number;
  entryPrice: number;
  stopPx: number | null;
  armed: boolean;
}): Promise<void> {
  // Off only if ops set HL_POST_PROFIT_SL=false. Protective-side check
  // below refuses a trigger that would fire through the market.
  if (process.env.HL_POST_PROFIT_SL === 'false') return;
  if (!opts.armed || opts.stopPx == null || opts.absSize <= 0) return;
  const notional = opts.absSize * opts.entryPrice;
  const minLockUsd = Math.max(1.25, notional * 0.0025);
  if (
    !profitStopSafeToPost({
      direction: opts.direction,
      stopPx: opts.stopPx,
      markPx: opts.markPrice,
      entryPx: opts.entryPrice,
      absSize: opts.absSize,
      minLockUsd,
    })
  ) {
    return;
  }

  const key = `${opts.userAddress.toLowerCase()}:${opts.coin.toUpperCase()}`;
  const prev = lastPosted.get(key);
  const movedPct =
    prev && prev.px > 0 ? Math.abs(opts.stopPx - prev.px) / prev.px : 1;
  if (prev && movedPct < 0.00015 && Date.now() - prev.at < 2_000) return;

  try {
    const meta = await fetchHlMeta();
    const assetIndex = coinToAssetIndex(meta, opts.coin);
    const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
    const isLong = opts.direction === 'LONG';
    const trigger = formatHlPrice(opts.stopPx, szDecimals);
    const client = clientFor(opts.userAddress);

    await client.order({
      orders: [
        {
          a: assetIndex,
          // Close LONG = sell; close SHORT = buy.
          b: !isLong,
          p: trigger,
          s: formatHlCloseSize(opts.absSize, szDecimals),
          r: true,
          t: {
            trigger: {
              isMarket: true,
              triggerPx: trigger,
              tpsl: 'sl',
            },
          },
        },
      ],
      grouping: 'positionTpsl',
    });

    lastPosted.set(key, { px: opts.stopPx, at: Date.now() });
    logger.info('HL profit SL posted', {
      user: opts.userAddress.slice(0, 10),
      coin: opts.coin,
      direction: opts.direction,
      stopPx: trigger,
      mark: opts.markPrice.toFixed(6),
    });
  } catch (err) {
    logger.warn('HL profit SL post failed', {
      user: opts.userAddress.slice(0, 10),
      coin: opts.coin,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
