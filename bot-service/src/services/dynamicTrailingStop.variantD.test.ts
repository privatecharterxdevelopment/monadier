import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, before, after } from 'node:test';
import {
  consolidateProfitStopPx,
  estimateRoundTripFeesUsd,
  evaluateDynamicTrail,
  profitStopPxForLockedUsd,
  isConsolidatedTrailVariantD,
  minProfitTrailGapPx,
  type TrailTickInput,
} from './dynamicTrailingStop';

const hypeFixture = JSON.parse(
  readFileSync(
    join(process.cwd(), 'tests/fixtures/hype-2026-11-13-1544-d.json'),
    'utf8'
  )
) as {
  trade: { entryPx: number; absSize: number };
  assertions: { variantDFirstStructuralMin: number; variantDFirstStructuralMax: number };
};

describe('Variant D consolidated trail', () => {
  const prevLegacy = process.env.HL_TRAIL_LEGACY;

  before(() => {
    delete process.env.HL_TRAIL_LEGACY;
  });

  after(() => {
    if (prevLegacy === undefined) delete process.env.HL_TRAIL_LEGACY;
    else process.env.HL_TRAIL_LEGACY = prevLegacy;
  });

  it('is active by default', () => {
    assert.equal(isConsolidatedTrailVariantD(), true);
  });

  it('SHORT structural stop does not move up when mark rallies (no glue)', () => {
    const entry = 72.316;
    const sz = 3.93;
    const fees = estimateRoundTripFeesUsd(entry * sz);
    const peakPnl = 0.67;
    const trailDist = entry * 0.0125;
    const base = {
      direction: 'SHORT' as const,
      entryPrice: entry,
      absSize: sz,
      tickSize: 0.001,
      feesUsd: fees,
      notionalUsd: entry * sz,
      highestPriceSinceEntry: 72.145,
      maxRunup: peakPnl,
      highestPnlSinceEntry: peakPnl,
      trailDistPx: trailDist,
      stage2Active: true,
    };
    const lowMark = consolidateProfitStopPx({
      ...base,
      markPrice: 72.2,
      currentTrailStop: null,
    });
    const rally = consolidateProfitStopPx({
      ...base,
      markPrice: 72.35,
      currentTrailStop: lowMark.structuralPx,
    });
    assert.ok(lowMark.structuralPx != null);
    assert.ok(rally.structuralPx != null);
    assert.ok(
      rally.structuralPx <= lowMark.structuralPx! + 1e-9,
      'SHORT stop must not loosen (move up) on glue rally'
    );
    const glue = 72.35 + minProfitTrailGapPx(72.35, 0.001);
    assert.ok(
      rally.structuralPx! < glue - 0.001,
      'structural must not track mark+gap'
    );
  });

  it('HYPE golden: stage1 stop near 72.261 at moderate peak', () => {
    const { entryPx, absSize } = hypeFixture.trade;
    const fees = estimateRoundTripFeesUsd(entryPx * absSize);
    const { structuralPx } = consolidateProfitStopPx({
      direction: 'SHORT',
      entryPrice: entryPx,
      markPrice: 72.22,
      absSize,
      tickSize: 0.001,
      feesUsd: fees,
      notionalUsd: entryPx * absSize,
      highestPriceSinceEntry: 72.18,
      maxRunup: 0.45,
      highestPnlSinceEntry: 0.45,
      currentTrailStop: null,
      trailDistPx: entryPx * 0.0125,
      stage2Active: false,
    });
    assert.ok(structuralPx != null);
    assert.ok(structuralPx >= hypeFixture.assertions.variantDFirstStructuralMin);
    assert.ok(structuralPx <= hypeFixture.assertions.variantDFirstStructuralMax);
  });

  it('partial size shifts stop px for the same locked USD (T-D-PF)', () => {
    const entry = 86.45;
    const lockUsd = 0.5;
    const mark = 86.0;
    const fullSz = 5.25;
    const halfSz = fullSz / 2;
    const fullPx = profitStopPxForLockedUsd({
      direction: 'SHORT',
      entryPrice: entry,
      absSize: fullSz,
      lockUsd,
      markPrice: mark,
      tickSize: 0.001,
    });
    const halfPx = profitStopPxForLockedUsd({
      direction: 'SHORT',
      entryPrice: entry,
      absSize: halfSz,
      lockUsd,
      markPrice: mark,
      tickSize: 0.001,
    });
    assert.ok(fullPx != null && halfPx != null);
    assert.ok(
      halfPx < fullPx,
      'smaller size tightens SHORT stop (lower trigger) for the same USD lock'
    );
  });
});

describe('evaluateDynamicTrail Variant D path', () => {
  function shortTick(
    over: Partial<TrailTickInput> & Pick<TrailTickInput, 'nowMs' | 'pnlUsd' | 'markPrice'>
  ): TrailTickInput {
    return {
      coin: 'HYPE',
      direction: 'SHORT',
      entryPrice: 72.316,
      absSize: 3.93,
      notionalUsd: 72.316 * 3.93,
      collateralUsd: (72.316 * 3.93) / 40,
      record: null,
      stopLossPct: 15,
      tickSize: 0.001,
      szDecimals: 2,
      fundingUsd: 0,
      leverage: 40,
      pctOnlyTrail: true,
      ...over,
    };
  }

  it('arms with structural stop not glued to mark (T-D-10)', async () => {
    delete process.env.HL_TRAIL_LEGACY;
    const t0 = 1_794_584_647_000;
    const pnl = 0.35;
    const mark = 72.22;
    const warm = await evaluateDynamicTrail(
      shortTick({ nowMs: t0, pnlUsd: 0.1, markPrice: 72.3 })
    );
    const armed = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 2_000,
        pnlUsd: pnl,
        markPrice: mark,
        record: warm.record,
      })
    );
    assert.ok(armed.record.currentTrailStop != null);
    const glue = mark + minProfitTrailGapPx(mark, 0.001);
    assert.ok(
      armed.record.currentTrailStop < glue - 0.0001 ||
        armed.record.phase === 'pending'
    );
  });
});
