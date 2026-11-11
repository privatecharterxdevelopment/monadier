import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import {
  coinToAssetIndex,
  fetchHlClearinghouseState,
  fetchHlMeta,
  formatHlCloseSize,
  formatHlPrice,
  type HlClearinghouseState,
} from './hlInfo';
import {
  buildEmergencyStopMarketLeg,
  fetchFrontendOpenOrders,
} from './hlProfitStopSync';
import type { EntrySlExchange, ExchangePosition } from './hlEntrySlFailSafe';

const transport = new HttpTransport();

function clientFor(userAddress: string): ExchangeClient {
  return new ExchangeClient({
    transport,
    wallet: deriveUserHlAgent(userAddress),
  });
}

function positionFromState(
  state: HlClearinghouseState | null,
  coin: string
): ExchangePosition | null {
  const row = state?.assetPositions?.find(
    (p) => p.position?.coin?.toUpperCase() === coin.toUpperCase()
  )?.position;
  if (!row) return null;
  const szi = Number(row.szi ?? 0);
  if (!Number.isFinite(szi) || Math.abs(szi) < 1e-12) return null;
  return {
    coin: String(row.coin ?? coin).toUpperCase(),
    szi,
    entryPx: Number(row.entryPx ?? 0),
    leverage: Number(row.leverage?.value ?? 1),
  };
}

/** Bind coin into the exchange adapter (fail-safe is per-coin). */
export function createHlEntrySlExchangeForCoin(
  userAddress: `0x${string}`,
  coin: string
): EntrySlExchange {
  const coinU = coin.toUpperCase();
  return {
    fetchPosition: async (c) => {
      const state = await fetchHlClearinghouseState(userAddress);
      if (!state) return 'unreachable';
      return positionFromState(state, c);
    },
    fetchOpenOrders: async () => {
      const orders = await fetchFrontendOpenOrders(userAddress);
      if (orders == null) return 'unreachable';
      return orders;
    },
    fetchRecentFills: async () => {
      try {
        const res = await fetch(config.hyperliquid.infoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'userFills',
            user: userAddress.toLowerCase(),
            aggregateByTime: true,
          }),
        });
        if (!res.ok) return 'unreachable';
        const rows = (await res.json()) as Array<{
          coin?: string;
          px?: string;
          sz?: string;
          side?: string;
          oid?: number;
          time?: number;
        }>;
        if (!Array.isArray(rows)) return [];
        return rows.map((f) => ({
          coin: String(f.coin ?? ''),
          px: Number(f.px ?? 0),
          sz: Number(f.sz ?? 0),
          side: String(f.side ?? ''),
          oid: f.oid,
          time: f.time,
        }));
      } catch {
        return 'unreachable';
      }
    },
    postEmergencySl: async ({ absSize, stopPx, direction }) => {
      try {
        const meta = await fetchHlMeta();
        const assetIndex = coinToAssetIndex(meta, coinU);
        const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
        const leg = buildEmergencyStopMarketLeg({
          assetIndex,
          direction,
          size: absSize,
          stopPx,
          szDecimals,
        });
        const client = clientFor(userAddress);
        const result = await client.order({ orders: [leg], grouping: 'na' });
        const status = result.response?.data?.statuses?.[0] as { error?: string } | undefined;
        if (status && 'error' in status && status.error) {
          return { accepted: false, error: String(status.error) };
        }
        logger.info('HL emergency SL posted', {
          user: userAddress.slice(0, 10),
          coin: coinU,
          stopPx,
          absSize,
          direction,
        });
        return { accepted: true };
      } catch (err) {
        return { accepted: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    flattenReduceOnly: async (absSize) => {
      try {
        const state = await fetchHlClearinghouseState(userAddress);
        if (!state) {
          return { attempted: true, remainingAbs: absSize, exchangeUnreachable: true };
        }
        const pos = positionFromState(state, coinU);
        if (!pos) {
          return { attempted: true, remainingAbs: 0, exchangeUnreachable: false };
        }
        const meta = await fetchHlMeta();
        const assetIndex = coinToAssetIndex(meta, coinU);
        const szDecimals = meta.universe[assetIndex]?.szDecimals ?? 4;
        const isLong = pos.szi > 0;
        const mark = pos.entryPx > 0 ? pos.entryPx : 0;
        const limitPx = isLong ? mark * 0.95 : mark * 1.05;
        const client = clientFor(userAddress);
        await client.order({
          orders: [
            {
              a: assetIndex,
              b: !isLong,
              p: formatHlPrice(limitPx > 0 ? limitPx : pos.entryPx, szDecimals),
              s: formatHlCloseSize(absSize, szDecimals),
              r: true,
              t: { limit: { tif: 'FrontendMarket' } },
            },
          ],
          grouping: 'na',
        });
        const after = await fetchHlClearinghouseState(userAddress);
        const left = positionFromState(after, coinU);
        return {
          attempted: true,
          remainingAbs: left ? Math.abs(left.szi) : 0,
          exchangeUnreachable: false,
        };
      } catch (err) {
        logger.warn('HL fail-safe flatten failed', {
          user: userAddress.slice(0, 10),
          coin: coinU,
          error: err instanceof Error ? err.message : String(err),
        });
        return { attempted: true, remainingAbs: absSize, exchangeUnreachable: true };
      }
    },
  };
}
