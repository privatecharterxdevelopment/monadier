/**
 * Live BTC / ETH volume + momentum — mega-cap flow indicator for alt entries.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine } from './signalEngine';
import { detectLiquiditySweep } from './liquiditySweepGate';
import type { HlLiquidUniverse } from './hlLiquidity';
import { getHlLiquidityForCoin } from './hlLiquidity';
import { btcLeadIsPumping } from './macroBetaGate';

export type MegaPairRow = {
  coin: 'BTC' | 'ETH';
  dayVolumeUsd: number;
  change5mPct: number;
  change15mPct: number;
  volRatio5m: number;
  sweepBias: 'LONG' | 'SHORT' | null;
  flow: 'INFLOW' | 'OUTFLOW' | 'FLAT';
};

export type MegaPairVolumeSnapshot = {
  at: string;
  pairs: MegaPairRow[];
  summary: string;
};

let lastSnapshot: MegaPairVolumeSnapshot | null = null;
let refreshInFlight: Promise<MegaPairVolumeSnapshot> | null = null;

function pctChange(candles: { close: number; open: number }[], bars: number): number {
  const closed = candles.slice(0, -1);
  if (closed.length < bars + 1) return 0;
  const end = closed[closed.length - 1];
  const start = closed[closed.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

function classifyFlow(change5m: number, change15m: number, volRatio: number): MegaPairRow['flow'] {
  const cfg = config.hyperliquid.megaPairVolume;
  const pumping = change5m >= cfg.pumpPct || change15m >= cfg.pumpPct15m;
  const dumping = change5m <= -cfg.pumpPct || change15m <= -cfg.pumpPct15m;
  if (pumping && volRatio >= cfg.minVolRatio) return 'INFLOW';
  if (dumping && volRatio >= cfg.minVolRatio) return 'OUTFLOW';
  return 'FLAT';
}

async function fetchMegaRow(
  coin: 'BTC' | 'ETH',
  dayVolumeUsd: number
): Promise<MegaPairRow> {
  const symbol = `${coin}USDT`;
  const c5m = await signalEngine.fetchCandles(symbol, '5m', 24);
  const c15m = await signalEngine.fetchCandles(symbol, '15m', 16);
  const sweep = detectLiquiditySweep(c5m);
  const change5mPct = pctChange(c5m, 1);
  const change15mPct = pctChange(c15m, 1);

  return {
    coin,
    dayVolumeUsd,
    change5mPct,
    change15mPct,
    volRatio5m: sweep.volumeRatio,
    sweepBias: sweep.bias,
    flow: classifyFlow(change5mPct, change15mPct, sweep.volumeRatio),
  };
}

function buildSummary(pairs: MegaPairRow[]): string {
  return pairs
    .map(
      (p) =>
        `${p.coin} 24h $${(p.dayVolumeUsd / 1e9).toFixed(2)}B · 5m ${p.change5mPct >= 0 ? '+' : ''}${p.change5mPct.toFixed(2)}% · vol ${p.volRatio5m.toFixed(2)}x · ${p.flow}${p.sweepBias ? ` · sweep ${p.sweepBias}` : ''}`
    )
    .join(' ‖ ');
}

export async function refreshMegaPairVolumeMonitor(
  liquidUniverse?: HlLiquidUniverse
): Promise<MegaPairVolumeSnapshot> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const btcVol =
        liquidUniverse != null
          ? getHlLiquidityForCoin(liquidUniverse, 'BTC')?.dayVolumeUsd ?? 0
          : 0;
      const ethVol =
        liquidUniverse != null
          ? getHlLiquidityForCoin(liquidUniverse, 'ETH')?.dayVolumeUsd ?? 0
          : 0;

      const [btc, eth] = await Promise.all([
        fetchMegaRow('BTC', btcVol),
        fetchMegaRow('ETH', ethVol),
      ]);
      const pairs = [btc, eth];
      const snapshot: MegaPairVolumeSnapshot = {
        at: new Date().toISOString(),
        pairs,
        summary: buildSummary(pairs),
      };
      lastSnapshot = snapshot;
      logger.info('Mega pair volume monitor', {
        btc5m: btc.change5mPct.toFixed(2),
        eth5m: eth.change5mPct.toFixed(2),
        btcVol: btc.volRatio5m.toFixed(2),
        ethVol: eth.volRatio5m.toFixed(2),
      });
      return snapshot;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export function getMegaPairVolumeSnapshot(): MegaPairVolumeSnapshot | null {
  return lastSnapshot;
}

/** Live BTC/ETH dump — block LONG even when RSS feeds are empty. */
export function isMacroRiskOffEnvironment(): { active: boolean; reason: string } {
  const snap = lastSnapshot;
  if (!snap || snap.pairs.length < 2) {
    return { active: false, reason: 'Mega pairs — data pending' };
  }

  const btc = snap.pairs.find((p) => p.coin === 'BTC');
  const eth = snap.pairs.find((p) => p.coin === 'ETH');
  if (!btc || !eth) {
    return { active: false, reason: 'Mega pairs — incomplete' };
  }

  const outflow = snap.pairs.filter((p) => p.flow === 'OUTFLOW').length;
  const dump15m = btc.change15mPct <= -0.3 && eth.change15mPct <= -0.2;
  const dump5m = btc.change5mPct <= -0.25 && eth.change5mPct <= -0.15;

  if (outflow >= 2) {
    return { active: true, reason: `BTC+ETH OUTFLOW — ${snap.summary}` };
  }
  if (dump15m || dump5m) {
    return {
      active: true,
      reason: `BTC/ETH dumping (BTC 5m ${btc.change5mPct.toFixed(2)}% 15m ${btc.change15mPct.toFixed(2)}%) — ${snap.summary}`,
    };
  }

  return { active: false, reason: snap.summary };
}

/** Gate alt entries against mega-cap volume flow. */
export function validateMegaPairVolumeForDirection(direction: 'LONG' | 'SHORT'): {
  ok: boolean;
  reason: string;
} {
  const snap = lastSnapshot;
  if (!snap || snap.pairs.length === 0) {
    return { ok: true, reason: 'Mega pairs — data pending' };
  }

  const inflow = snap.pairs.filter((p) => p.flow === 'INFLOW');
  const outflow = snap.pairs.filter((p) => p.flow === 'OUTFLOW');
  if (direction === 'SHORT' && inflow.length >= 2 && btcLeadIsPumping()) {
    return {
      ok: false,
      reason: `Mega pair INFLOW blocks SHORT — ${snap.summary}`,
    };
  }
  if (direction === 'LONG' && outflow.length >= 2) {
    return {
      ok: false,
      reason: `Mega pair OUTFLOW blocks LONG — ${snap.summary}`,
    };
  }

  return {
    ok: true,
    reason: `Mega pairs OK for ${direction} — ${snap.summary}`,
  };
}

export function megaPairVolumeOpenReasonLine(): string {
  const snap = lastSnapshot;
  if (!snap) return 'Mega pairs: monitoring…';
  return `Mega pairs: ${snap.summary}`;
}
