/**
 * Historical SHORT fill replay for short_entry_quality (HL candles as-of fill, no lookahead).
 * Holdout for manual checks: XRP, ETH — validation metrics use all other opens.
 */
process.env.BOT_PRIVATE_KEY =
  process.env.BOT_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/config';
import { analyzeSrZones } from '../src/services/entryLocationGate';
import { scoreShortEntryQuality } from '../src/services/shortEntryQuality';
import { isConfirmedShortBreakdown } from '../src/services/shortBreakdownConfirm';
import type { Candle } from '../src/services/signalEngine';

const WALLET =
  process.env.REPLAY_WALLET || '0x1fBc2A0Ab6a8fA5F6B9645392433483b25a8Cd84';
const HOLDOUT = new Set(['XRP', 'ETH']);
const HL_INFO = config.hyperliquid.infoUrl;

type HlFill = {
  coin: string;
  px: string;
  sz: string;
  time: number;
  dir: string;
  closedPnl: string;
};

const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
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
    signal: AbortSignal.timeout(20_000),
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

function rangePositionInWindow(candles: Candle[]): number {
  if (candles.length < 3) return 0.5;
  const price = candles[candles.length - 1]!.close;
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  const span = hi - lo;
  if (!(span > 0)) return 0.5;
  return (price - lo) / span;
}

function groupOpens(fills: HlFill[]): Array<{
  coin: string;
  time: number;
  vwapPx: number;
  totalSz: number;
}> {
  const map = new Map<string, HlFill[]>();
  for (const f of fills.filter((x) => x.dir === 'Open Short')) {
    const k = `${f.coin}:${f.time}`;
    const arr = map.get(k) ?? [];
    arr.push(f);
    map.set(k, arr);
  }
  const out: Array<{ coin: string; time: number; vwapPx: number; totalSz: number }> = [];
  for (const [, legs] of map) {
    const coin = legs[0]!.coin;
    const time = legs[0]!.time;
    let sumPxSz = 0;
    let sumSz = 0;
    for (const l of legs) {
      const sz = Number(l.sz);
      const px = Number(l.px);
      sumPxSz += px * sz;
      sumSz += sz;
    }
    out.push({ coin, time, vwapPx: sumPxSz / sumSz, totalSz: sumSz });
  }
  return out.sort((a, b) => b.time - a.time);
}

function realizedPnlAfterOpen(all: HlFill[], coin: string, openTime: number): number {
  const fills = all
    .filter((f) => f.coin === coin && f.time > openTime)
    .sort((a, b) => a.time - b.time);
  let pnl = 0;
  for (const f of fills) {
    if (f.dir === 'Close Short') pnl += Number(f.closedPnl);
  }
  return pnl;
}

async function evaluateAt(
  coin: string,
  endTimeMs: number,
  markPx: number
) {
  const [c1mRaw, c5raw, c15raw, c1hraw] = await Promise.all([
    hlCandleSnapshot(coin, '1m', endTimeMs, 120),
    hlCandleSnapshot(coin, '5m', endTimeMs, 80),
    hlCandleSnapshot(coin, '15m', endTimeMs, 72),
    hlCandleSnapshot(coin, '1h', endTimeMs, 56),
  ]);
  const candles1m = closedBefore(c1mRaw, endTimeMs, '1m');
  const candles5m = closedBefore(c5raw, endTimeMs, '5m');
  const candles15m = closedBefore(c15raw, endTimeMs, '15m');
  const candles1h = closedBefore(c1hraw, endTimeMs, '1h');

  const quality = scoreShortEntryQuality({
    coin,
    price: markPx,
    candles1m,
    candles5m,
    candles15m,
    candles1h,
  });

  const pos1h = rangePositionInWindow(candles1h.slice(-24));
  const pos15 = rangePositionInWindow(candles15m.slice(-20));
  const floorTag = pos1h <= 0.25 || pos15 <= 0.22;
  const breakdown = isConfirmedShortBreakdown({ candles5m, candles15m });

  return {
    quality,
    pos1h,
    pos15,
    floorTag,
    breakdown,
    candles1mCount: candles1m.length,
    candles5mCount: candles5m.length,
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
  const opens = groupOpens(fills);

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < opens.length; i += 1) {
    const o = opens[i]!;
    process.stderr.write(`replay ${i + 1}/${opens.length} ${o.coin}\n`);
    await new Promise((r) => setTimeout(r, 150));
    const ev = await evaluateAt(o.coin, o.time, o.vwapPx);
    const q = ev.quality;
    rows.push({
      coin: o.coin,
      timeMs: o.time,
      timeDubai: new Date(o.time).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' }),
      timeUtc: new Date(o.time).toISOString(),
      entryPx: Number(o.vwapPx.toFixed(6)),
      sz: o.totalSz,
      pass: q.ok,
      code: q.code,
      entryType: q.record.entryType,
      distanceSupportAtr: q.record.distanceSupportAtr,
      distanceResistanceAtr: q.record.distanceResistanceAtr,
      dumpExtensionAtr: q.record.dumpExtensionAtr,
      reversalRiskScore: q.record.reversalRiskScore,
      reversalHardVeto: q.record.reversalHardVeto,
      reason: q.reason,
      floorTag: ev.floorTag,
      pos1h: Number(ev.pos1h.toFixed(3)),
      pos15: Number(ev.pos15.toFixed(3)),
      breakdownAtEntry: ev.breakdown,
      realizedPnl: realizedPnlAfterOpen(fills, o.coin, o.time),
      holdout: HOLDOUT.has(o.coin.toUpperCase()),
    });
  }

  const validation = rows.filter((r) => !r.holdout);
  const bottoms = validation.filter((r) => r.floorTag === true);
  const goods = validation.filter(
    (r) =>
      r.pass === true &&
      (r.entryType === 'BREAKDOWN_FOLLOWTHROUGH' ||
        r.entryType === 'RESISTANCE_REJECTION' ||
        r.entryType === 'RETEST_BROKEN_SUPPORT')
  );

  const bottomBlockedPct =
    bottoms.length > 0
      ? (bottoms.filter((r) => !r.pass).length / bottoms.length) * 100
      : null;
  const goodStillAllowedPct =
    goods.length > 0
      ? (goods.filter((r) => r.pass === true).length / goods.length) * 100
      : null;

  const spotlight = rows.filter((r) => r.coin === 'XRP' || r.coin === 'ETH');

  const summary = {
    wallet: WALLET,
    commit: '6d3b1cf+pre-submit',
    generatedAt: new Date().toISOString(),
    openShortEvents: rows.length,
    holdoutCoins: [...HOLDOUT],
    validationCount: validation.length,
    metrics: {
      bottomShortsTagged: bottoms.length,
      bottomWouldBlockPct: bottomBlockedPct,
      goodShortsTagged: goods.length,
      goodStillAllowedPct,
    },
    spotlight,
    validationSample: validation.slice(0, 15),
    allRows: rows,
  };

  const outJson = join(process.cwd(), '..', 'docs', 'SHORT_ENTRY_QUALITY_REPLAY.json');
  const outMd = join(process.cwd(), '..', 'docs', 'SHORT_ENTRY_QUALITY_REPLAY.md');
  writeFileSync(outJson, JSON.stringify(summary, null, 2));

  const md = `# SHORT entry quality — historical replay

**Wallet:** \`${WALLET}\`  
**Generated:** ${summary.generatedAt} (UTC)  
**Candles:** Hyperliquid \`candleSnapshot\`, closed bars only as-of fill time.

## Holdout (Einzelnachweise)

${spotlight
  .map(
    (r) =>
      `| ${r.coin} | ${r.timeDubai} (Dubai) | ${r.entryPx} | ${r.pass ? 'PASS' : 'BLOCK'} | \`${r.code}\` | ${r.entryType} | sup ${r.distanceSupportAtr ?? '—'}×ATR ext ${r.dumpExtensionAtr ?? '—'}×ATR rev ${r.reversalRiskScore} |`
  )
  .join('\n')}

| Coin | Dubai time | Entry | PASS/BLOCK | Code | Entry type | Metrics |

## Validation set (ohne XRP/ETH)

| Metric | Value |
|--------|------:|
| Bottom-tagged SHORT events | ${bottoms.length} |
| **Bottom would BLOCK now** | **${bottomBlockedPct?.toFixed(1) ?? 'n/a'}%** |
| Good-tagged SHORT events | ${goods.length} |
| **Good still ALLOWED** | **${goodStillAllowedPct?.toFixed(1) ?? 'n/a'}%** |

Good = PASS at entry with valid entry type on validation set.

## Order-path coverage

- \`openMarketPosition\`: SHORT → \`evaluateShortEntryQualityPreSubmit\` immediately before \`client.order\` (no \`skipOpenGates\` bypass).
- Force/manual paths use \`skipOpenGates: true\` for secondary gates only; **short quality still runs**.

## Verbleibende Risiken

- Replay uses HL candles; live gate uses Binance via \`signalEngine\` — small timestamp/close diffs possible.
- userFills API window may truncate very old opens.
- Mark drift re-check uses live mids at submit time (not replayed).
`;

  writeFileSync(outMd, md);
  console.log(JSON.stringify({ ...summary, allRows: undefined, validationSample: undefined }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});