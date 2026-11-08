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

function protectiveSideOk(
  direction: 'LONG' | 'SHORT',
  stopPx: number,
  markPx: number,
  entryPx: number
): boolean {
  if (!(stopPx > 0) || !(markPx > 0) || !(entryPx > 0)) return false;
  if (direction === 'LONG') {
    // SL below mark, not through entry into a hard loss.
    return stopPx < markPx && stopPx >= entryPx * 0.997;
  }
  return stopPx > markPx && stopPx <= entryPx * 1.003;
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
  if (!opts.armed || opts.stopPx == null || opts.absSize <= 0) return;
  if (!protectiveSideOk(opts.direction, opts.stopPx, opts.markPrice, opts.entryPrice)) {
    return;
  }

  const key = `${opts.userAddress.toLowerCase()}:${opts.coin.toUpperCase()}`;
  const prev = lastPosted.get(key);
  const movedPct =
    prev && prev.px > 0 ? Math.abs(opts.stopPx - prev.px) / prev.px : 1;
  if (prev && movedPct < 0.0008 && Date.now() - prev.at < 12_000) return;

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
