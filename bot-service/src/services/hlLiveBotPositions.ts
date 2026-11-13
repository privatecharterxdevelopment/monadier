/**
 * Exchange-backed position snapshot for /api/bot-status.
 * Confirmed flags are true only when a matching HL trigger is visible.
 */
import {
  classifyHlTriggerOrder,
  emergencySideOk,
  fetchFrontendOpenOrders,
  isProfitTriggerKind,
  lastConfirmedProfitStopPx,
} from './hlProfitStopSync';
import {
  breakevenPlusFeesStopPx,
  estimateRoundTripFeesUsd,
  markFromPosition,
  netPnlForProfitArm,
} from './dynamicTrailingStop';
import { getDynamicTrailRecord } from './profitTrailState';
import { hlTickSize, type HlClearinghouseState } from './hlInfo';
import { config } from '../config';

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
  profitSlPx: number | null;
  profitSlConfirmed: boolean;
  /** In-memory / computed px — never treated as exchange-confirmed. */
  profitSlMemoryPx: number | null;
  profitSlStatus: 'idle' | 'PROFIT_SL_PENDING' | 'PROFIT_SL_CONFIRMED' | 'PROFIT_SL_UNVERIFIED';
  trailPhase: 'idle' | 'pending' | 'armed' | 'trailing' | null;
  computedTrailStopPx: number | null;
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
    const markPx =
      entryPx > 0
        ? markFromPosition(entryPx, direction === 'LONG' ? absSize : -absSize, upnlUsd)
        : entryPx;
    const feesUsd = estimateRoundTripFeesUsd(notional > 0 ? notional : absSize * markPx);
    const notionalForFees = notional > 0 ? notional : absSize * markPx;
    const netPnlUsd = netPnlForProfitArm(upnlUsd, notionalForFees, feesUsd);
    const trail = getDynamicTrailRecord(`${opts.wallet.toLowerCase()}:${coin}`);
    const tick = hlTickSize(markPx > 0 ? markPx : entryPx, 4);
    const bePx = breakevenPlusFeesStopPx(
      direction,
      entryPx,
      absSize,
      feesUsd,
      0,
      notional > 0 ? notional : absSize * markPx,
      tick,
      4
    );

    let emergencySlPx: number | null = null;
    let emergencySlConfirmed = false;
    let profitSlPx: number | null = null;
    let profitSlConfirmed = false;
    if (orders) {
      for (const o of orders) {
        const kind = classifyHlTriggerOrder(o, coin, direction, entryPx, bePx);
        const trig = Number(o.triggerPx ?? o.limitPx ?? 0);
        if (!(trig > 0)) continue;
        if (kind === 'emergency_market' && emergencySideOk(direction, trig, entryPx, entryPx)) {
          emergencySlPx = trig;
          emergencySlConfirmed = true;
        }
        if (isProfitTriggerKind(kind)) {
          profitSlPx = trig;
          profitSlConfirmed = true;
        }
      }
    }
    let profitSlMemoryPx: number | null = null;
    if (!profitSlConfirmed) {
      const mem = lastConfirmedProfitStopPx(opts.wallet, coin);
      if (mem != null && mem > 0) {
        profitSlMemoryPx = mem;
        if (profitSlPx == null) profitSlPx = mem;
      }
    }

    const profitTarget = config.hyperliquid.minProfitCloseUsd;
    const pending =
      upnlUsd > 0 &&
      !profitSlConfirmed &&
      netPnlUsd >= profitTarget &&
      (trail?.phase === 'pending' ||
        trail?.phase === 'idle' ||
        trail?.phase === 'armed' ||
        trail?.phase === 'trailing' ||
        !trail);
    const profitSlStatus: LiveBotPositionView['profitSlStatus'] = profitSlConfirmed
      ? 'PROFIT_SL_CONFIRMED'
      : profitSlMemoryPx != null
        ? 'PROFIT_SL_UNVERIFIED'
        : pending
          ? 'PROFIT_SL_PENDING'
          : 'idle';

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
      profitSlPx,
      profitSlConfirmed,
      profitSlMemoryPx,
      profitSlStatus,
      trailPhase: trail?.phase ?? null,
      computedTrailStopPx: trail?.currentTrailStop ?? null,
      source: 'hyperliquid',
    });
  }
  return out;
}
