/**
 * Exchange-backed position snapshot for /api/bot-status.
 * emergencySlConfirmed is true only when a matching HL trigger is visible.
 */
import {
  classifyHlTriggerOrder,
  emergencySideOk,
  fetchFrontendOpenOrders,
} from './hlProfitStopSync';
import { estimateRoundTripFeesUsd, netPnlAfterCosts } from './dynamicTrailingStop';
import { getDynamicTrailRecord } from './profitTrailState';
import type { HlClearinghouseState } from './hlInfo';

export type LiveBotPositionView = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
  absSize: number;
  leverage: number;
  marginUsd: number;
  upnlUsd: number;
  feesUsd: number;
  netPnlUsd: number;
  emergencySlPx: number | null;
  emergencySlConfirmed: boolean;
  trailPhase: 'idle' | 'armed' | 'trailing' | null;
  trailStopPx: number | null;
  source: 'hyperliquid';
};

export async function buildLiveBotPositionViews(opts: {
  wallet: string;
  state: HlClearinghouseState | null;
}): Promise<LiveBotPositionView[]> {
  const rows = opts.state?.assetPositions ?? [];
  if (rows.length === 0) return [];
  const orders = await fetchFrontendOpenOrders(opts.wallet);
  const out: LiveBotPositionView[] = [];

  for (const row of rows) {
    const pos = row.position;
    if (!pos?.coin) continue;
    const szi = Number(pos.szi ?? 0);
    if (!Number.isFinite(szi) || Math.abs(szi) < 1e-12) continue;
    const coin = pos.coin.toUpperCase();
    const direction: 'LONG' | 'SHORT' = szi > 0 ? 'LONG' : 'SHORT';
    const entryPx = Number(pos.entryPx ?? 0);
    const absSize = Math.abs(szi);
    const leverage = Math.max(1, Number(pos.leverage?.value ?? 1));
    const notional = Math.abs(Number((pos as { positionValue?: string }).positionValue ?? 0));
    const marginUsd = notional > 0 ? notional / leverage : entryPx > 0 ? (absSize * entryPx) / leverage : 0;
    const upnlUsd = Number(pos.unrealizedPnl ?? 0);
    const feesUsd = estimateRoundTripFeesUsd(notional > 0 ? notional : absSize * entryPx);
    const netPnlUsd = netPnlAfterCosts(upnlUsd, notional > 0 ? notional : absSize * entryPx, feesUsd);
    const trail = getDynamicTrailRecord(`${opts.wallet.toLowerCase()}:${coin}`);

    let emergencySlPx: number | null = null;
    let emergencySlConfirmed = false;
    if (orders) {
      for (const o of orders) {
        const kind = classifyHlTriggerOrder(o, coin, direction, entryPx, entryPx);
        if (kind !== 'emergency_market') continue;
        const trig = Number(o.triggerPx ?? o.limitPx ?? 0);
        if (!(trig > 0)) continue;
        if (!emergencySideOk(direction, trig, entryPx, entryPx)) continue;
        emergencySlPx = trig;
        emergencySlConfirmed = true;
        break;
      }
    }

    out.push({
      coin,
      direction,
      entryPx,
      absSize,
      leverage,
      marginUsd,
      upnlUsd,
      feesUsd,
      netPnlUsd,
      emergencySlPx,
      emergencySlConfirmed,
      trailPhase: trail?.phase ?? null,
      trailStopPx: trail?.currentTrailStop ?? null,
      source: 'hyperliquid',
    });
  }
  return out;
}
