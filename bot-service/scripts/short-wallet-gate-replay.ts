/**
 * Wallet-scoped SHORT open replay — gates evaluated with candles as-of fill time (no lookahead).
 * Does NOT estimate hypothetical PnL deltas; only tags realized closedPnl on closed round-trips.
 */
process.env.BOT_PRIVATE_KEY =
  process.env.BOT_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001';
import { config } from '../src/config';
import { analyzeSrZones, evaluateEntryLocation } from '../src/services/entryLocationGate';
import { evaluateMacroBetaFrom15mCandles } from '../src/services/macroBetaGate';
import { rangePositionInWindow } from '../src/services/shortHtfFloorGate';
import { isConfirmedShortBreakdown } from '../src/services/shortBreakdownConfirm';
import { isShortDumpContinuation } from '../src/services/shortDumpStructure';
import { scoreEntryLocationQuality } from '../src/services/entryLocationQuality';
import { calculateATR } from '../src/services/dynamicTrailingStop';
import type { Candle } from '../src/services/signalEngine';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WALLET =
  process.env.REPLAY_WALLET || '0x1fBc2A0Ab6a8fA5F6B9645392433483b25a8Cd84';
const HL_INFO = config.hyperliquid.infoUrl;

type HlFill = {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  dir: string;
  closedPnl: string;
};

const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
};

async function hlCandleSnapshot(
  coin: string,
  interval: string,
  endTime: number,
  limit: number
): Promise<Candle[]> {
  const step = TF_MS[interval] ?? 900_000;
  const startTime = endTime - Math.ceil(limit * 1.35) * step;
  const res = await fetch(HL_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: { coin: coin.toUpperCase(), interval, startTime, endTime },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const rows = (await res.json()) as Array<{
    t?: number;
    o?: string | number;
    h?: string | number;
    l?: string | number;
    c?: string | number;
    v?: string | number;
  }>;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((k) => ({
      time: Number(k.t) || 0,
      open: Number(k.o),
      high: Number(k.h),
      low: Number(k.l),
      close: Number(k.c),
      volume: Number(k.v) || 0,
    }))
    .filter((c) => c.time > 0 && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);
}

function closedBefore(candles: Candle[], endTimeMs: number, tf: string): Candle[] {
  const tfMs = TF_MS[tf] ?? 900_000;
  return candles.filter((c) => c.time + tfMs <= endTimeMs);
}

function pctChangeClosed(candles: Candle[], bars: number): number {
  const closed = candles.slice(0, -1);
  if (closed.length < bars + 1) return 0;
  const end = closed[closed.length - 1]!;
  const start = closed[closed.length - 1 - bars]!;
  if (!start.close || !end.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

function tfLongCount(c5: Candle[], c15: Candle[], c1h: Candle[]): number {
  let n = 0;
  const last15 = closedBefore(c15, c15[c15.length - 1]?.time ?? 0, '15m').slice(-1)[0];
  const last1h = closedBefore(c1h, c1h[c1h.length - 1]?.time ?? 0, '1h').slice(-1)[0];
  const last5 = closedBefore(c5, c5[c5.length - 1]?.time ?? 0, '5m').slice(-1)[0];
  for (const c of [last5, last15, last1h]) {
    if (c && c.close > c.open) n += 1;
  }
  return n;
}

/** Pump-short logic mirroring pumpShortGate (candle-only, no signalEngine). */
function evaluatePumpShortAt(
  coin: string,
  c15: Candle[],
  c1h: Candle[],
  c5: Candle[]
): { ok: boolean; code: string } {
  if (coin === 'BTC' || coin === 'ETH') return { ok: true, code: 'PUMP_SHORT_SKIP_MAJOR' };
  const cfg = config.hyperliquid.pumpShort;
  const higherLong = tfLongCount(c5, c15, c1h);
  if (higherLong >= cfg.minHigherTfLongBlock) {
    return { ok: false, code: 'PUMP_SHORT_HTF_LONG' };
  }
  const ch1h = pctChangeClosed(c1h, 1);
  const ch4h = pctChangeClosed(c1h, 4);
  const ch15m = pctChangeClosed(c15, 1);
  if (ch1h >= cfg.block1hPct || ch4h >= cfg.block4hPct) {
    return { ok: false, code: 'PUMP_SHORT_STILL_PUMPING' };
  }
  if (ch15m > -cfg.min15mRolloverPct) {
    return { ok: false, code: 'PUMP_SHORT_NO_ROLLOVER' };
  }
  const last15 = c15[c15.length - 2];
  const last1h = c1h[c1h.length - 2];
  const tf15Short = last15 ? last15.close < last15.open : false;
  const tf1hShort = last1h ? last1h.close < last1h.open : false;
  if (!tf15Short && !tf1hShort) {
    return { ok: false, code: 'PUMP_SHORT_NO_SHORT_TF' };
  }
  return { ok: true, code: 'PUMP_SHORT_PASS' };
}

function broadBullishImpulse(btc15: Candle[], eth15: Candle[]): string[] {
  const hits: string[] = [];
  const btc = btc15.slice(-8);
  const eth = eth15.slice(-8);
  if (btc.length < 4 || eth.length < 4) return hits;
  const net = (bars: Candle[]) => {
    if (bars.length < 2) return { m15: 0, h1: 0 };
    const m15 = ((bars[bars.length - 1]!.close - bars[bars.length - 2]!.open) / bars[bars.length - 2]!.open) * 100;
    const h1 = ((bars[bars.length - 1]!.close - bars[Math.max(0, bars.length - 5)]!.open) / bars[Math.max(0, bars.length - 5)]!.open) * 100;
    return { m15, h1 };
  };
  const b = net(btc);
  const e = net(eth);
  const min15 = Number(process.env.HL_REGIME_PUMP_15M_PCT || 0.35);
  const min1h = Number(process.env.HL_REGIME_PUMP_1H_PCT || 0.85);
  const btcUp = b.m15 >= min15 && b.h1 >= min1h * 0.6;
  const ethUp = e.m15 >= min15 && e.h1 >= min1h * 0.6;
  if (btcUp && ethUp) hits.push('BTC+ETH sync pump');
  return hits;
}

function htfFloorBlocks(
  c1h: Candle[],
  c5: Candle[],
  c15: Candle[],
  pos1h: number,
  pos15: number,
  breakdown: boolean,
  dumpCont: boolean
): string[] {
  const blocks: string[] = [];
  const floor1h = Number(process.env.HL_SHORT_1H_FLOOR_MAX || 0.25);
  const floor15 = Number(process.env.HL_SHORT_15M_FLOOR_MAX || 0.22);
  const atFloor = pos1h <= floor1h || pos15 <= floor15;
  if (atFloor && !breakdown) blocks.push('SHORT_HTF_FLOOR');
  if (atFloor && breakdown) {
    const closed1h = c1h.slice(-24);
    const px = closed1h[closed1h.length - 1]?.close ?? 0;
    const lo = Math.min(...closed1h.map((c) => c.low));
    const atr = calculateATR(c1h, 14);
    const minRoomAtr = Number(process.env.HL_SHORT_FLOOR_MIN_DOWNSIDE_ATR || 0.55);
    const downsideAtr = atr > 0 && px > 0 ? (px - lo) / atr : 0;
    if (!dumpCont && downsideAtr < minRoomAtr) blocks.push('SHORT_FLOOR_NO_DOWNSIDE');
  }
  return blocks;
}

function realizedPnlAfterOpen(all: HlFill[], open: HlFill): number {
  const fills = all
    .filter((f) => f.coin === open.coin && f.time > open.time)
    .sort((a, b) => a.time - b.time);
  let need = Number(open.sz);
  let pnl = 0;
  for (const f of fills) {
    const sz = Number(f.sz);
    if (f.dir === 'Open Short') need += sz;
    if (f.dir === 'Close Short') {
      pnl += Number(f.closedPnl);
      need -= sz;
      if (need <= 1e-8) return pnl;
    }
  }
  return pnl;
}

async function evaluateGatesAt(
  coin: string,
  endTimeMs: number,
  markPx: number
): Promise<{
  newBlocks: string[];
  legacyBlocks: string[];
  breakdownContinuation: boolean;
}> {
  const newBlocks: string[] = [];
  const legacyBlocks: string[] = [];

  const [btc15raw, eth15raw, c5raw, c15raw, c1hraw, c4raw] = await Promise.all([
    hlCandleSnapshot('BTC', '15m', endTimeMs, 40),
    hlCandleSnapshot('ETH', '15m', endTimeMs, 40),
    hlCandleSnapshot(coin, '5m', endTimeMs, 56),
    hlCandleSnapshot(coin, '15m', endTimeMs, 40),
    hlCandleSnapshot(coin, '1h', endTimeMs, 32),
    hlCandleSnapshot(coin, '4h', endTimeMs, 28),
  ]);

  const btc15 = closedBefore(btc15raw, endTimeMs, '15m');
  const eth15 = closedBefore(eth15raw, endTimeMs, '15m');
  const c5 = closedBefore(c5raw, endTimeMs, '5m');
  const c15 = closedBefore(c15raw, endTimeMs, '15m');
  const c1h = closedBefore(c1hraw, endTimeMs, '1h');
  const c4 = closedBefore(c4raw, endTimeMs, '4h');

  if (btc15.length < 10 || eth15.length < 10) {
    newBlocks.push('REGIME_DATA_STALE');
  }

  const impulse = broadBullishImpulse(btc15, eth15);
  if (impulse.length) newBlocks.push('PUMP_SHORT_BLOCK_BROAD');

  const pump = evaluatePumpShortAt(coin, c15, c1h, c5);
  if (!pump.ok) newBlocks.push(pump.code);

  const macro = evaluateMacroBetaFrom15mCandles({
    coin,
    direction: 'SHORT',
    btc15,
    eth15,
    coin15: c15,
  });
  if (!macro.ok) newBlocks.push('MACRO_BETA');

  const LEGACY_BYPASS_MACRO = true;
  const LEGACY_BYPASS_PUMP = true;
  if (!macro.ok && !LEGACY_BYPASS_MACRO) legacyBlocks.push('MACRO_BETA');
  if (!pump.ok && !LEGACY_BYPASS_PUMP) legacyBlocks.push(pump.code);

  const sr = analyzeSrZones(c5, c15);
  sr.dumpContinuation = isShortDumpContinuation({ candles15m: c15, candles5m: c5 });
  const loc = evaluateEntryLocation('SHORT', sr);
  if (!loc.ok) newBlocks.push(loc.code);

  const legacySr = { ...sr, recentResistanceRejections: sr.resistanceRejections };
  const legacyLoc = evaluateEntryLocation('SHORT', legacySr);
  if (!legacyLoc.ok && loc.ok) {
    legacyBlocks.push('LOCATION_STALE_REJECTION_OK');
  } else if (!legacyLoc.ok) {
    legacyBlocks.push(legacyLoc.code);
  }

  const pos1h = rangePositionInWindow(c1h.slice(-24));
  const pos15 = rangePositionInWindow(c15.slice(-20));
  const floor1h = Number(process.env.HL_SHORT_1H_FLOOR_MAX || 0.25);
  const floor15 = Number(process.env.HL_SHORT_15M_FLOOR_MAX || 0.22);
  const atFloor = pos1h <= floor1h || pos15 <= floor15;
  const breakdown = isConfirmedShortBreakdown({ candles5m: c5, candles15m: c15 });
  const dumpCont = sr.dumpContinuation === true;

  if (atFloor && !breakdown) newBlocks.push('SHORT_HTF_FLOOR');
  newBlocks.push(...htfFloorBlocks(c1h, c5, c15, pos1h, pos15, breakdown, dumpCont));
  if (atFloor && breakdown && !dumpCont) {
    legacyBlocks.push('LEGACY_FLOOR_BREAKDOWN_OK');
  }

  const qual = scoreEntryLocationQuality({
    coin,
    side: 'SHORT',
    price: markPx,
    candles5m: c5,
    candles15m: c15,
    candles1h: c1h,
    candles4h: c4,
    sr,
  });
  if (qual.deterministicLocationDecision === 'BLOCK') {
    newBlocks.push(...qual.blockedBy);
  }

  return {
    newBlocks: [...new Set(newBlocks)],
    legacyBlocks: [...new Set(legacyBlocks)],
    breakdownContinuation: breakdown && dumpCont,
  };
}

async function main() {
  const res = await fetch(HL_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFills', user: WALLET }),
    signal: AbortSignal.timeout(60_000),
  });
  const fills = (await res.json()) as HlFill[];
  const opens = fills
    .filter((f) => f.dir === 'Open Short')
    .sort((a, b) => a.time - b.time);

  const results: Array<Record<string, unknown>> = [];
  let idx = 0;
  for (const o of opens) {
    idx += 1;
    process.stderr.write(`replay ${idx}/${opens.length} ${o.coin}\n`);
    await new Promise((r) => setTimeout(r, 120));
    const gates = await evaluateGatesAt(o.coin, o.time, Number(o.px));
    const realizedPnl = realizedPnlAfterOpen(fills, o);
    const newBlocked = gates.newBlocks.length > 0;
    results.push({
      coin: o.coin,
      time: new Date(o.time).toISOString(),
      timeMs: o.time,
      px: o.px,
      newBlocked,
      newBlocks: gates.newBlocks,
      legacyWouldBlock: gates.legacyBlocks.length > 0,
      legacyBlocks: gates.legacyBlocks,
      breakdownContinuationAllowed:
        gates.breakdownContinuation && gates.newBlocks.length === 0,
      realizedRoundTripPnl: realizedPnl,
      profitable: realizedPnl > 0,
    });
  }

  const blocked = results.filter((r) => r.newBlocked);
  const blockedProfit = blocked.filter((r) => r.profitable);
  const blockedLoss = blocked.filter((r) => !r.profitable && (r.realizedRoundTripPnl as number) < 0);
  const allowedBreakdown = results.filter((r) => r.breakdownContinuationAllowed);

  const summary = {
    wallet: WALLET,
    generatedAt: new Date().toISOString(),
    openShortCount: opens.length,
    newGateBlockedCount: blocked.length,
    newGateBlockedProfitable: blockedProfit.length,
    newGateBlockedLoss: blockedLoss.length,
    breakdownContinuationStillAllowed: allowedBreakdown.length,
    notable: results.filter((r) =>
      ['WLFI', 'ARB', 'TRUMP', 'WLFI'].includes(String(r.coin))
    ),
    byBlockCode: Object.fromEntries(
      [...new Set(blocked.flatMap((r) => r.newBlocks as string[]))].map((code) => [
        code,
        blocked.filter((r) => (r.newBlocks as string[]).includes(code)).length,
      ])
    ),
    rows: results,
  };

  const out = join(process.cwd(), '..', 'docs', 'SHORT_WALLET_REPLAY_RESULTS.json');
  writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, rows: undefined }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
