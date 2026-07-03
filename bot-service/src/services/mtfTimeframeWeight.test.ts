import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDirectionalTfCount,
  isMacroTrendAnchor,
  isTrendFollowing,
  macroTrendWeightMultipliers,
  meetsReversalTfRequirement,
  passesMtfAlignmentGate,
} from './mtfTimeframeWeight';

describe('mtfTimeframeWeight', () => {
  const xrpPumpTfs = [
    { timeframe: '5m', direction: 'LONG' as const },
    { timeframe: '15m', direction: 'SHORT' as const },
    { timeframe: '1h', direction: 'LONG' as const },
  ];

  it('trend-following LONG ignores 5m vote — XRP pump case without macro anchor', () => {
    assert.equal(isTrendFollowing('LONG', 'UP'), true);
    assert.equal(computeDirectionalTfCount(xrpPumpTfs, 'LONG', 'UP'), 1);
    const gate = passesMtfAlignmentGate({
      timeframes: xrpPumpTfs,
      tradeDirection: 'LONG',
      htfTrend1h: 'UP',
      minDirectionalTfs: 2,
    });
    assert.equal(gate.directionalTfCount, 1);
    assert.equal(gate.ok, false);
  });

  it('macro pump anchor — 1h LONG passes despite 15m pullback (SOL-style)', () => {
    const tfs = [
      { timeframe: '5m', direction: 'SHORT' as const },
      { timeframe: '15m', direction: 'SHORT' as const },
      { timeframe: '1h', direction: 'LONG' as const },
    ];
    assert.equal(
      isMacroTrendAnchor({
        tradeDirection: 'LONG',
        htfTrend1h: 'UP',
        macroTrend: 'UP',
        h1Direction: 'LONG',
        h1Confidence: 100,
      }),
      true
    );
    assert.equal(
      computeDirectionalTfCount(tfs, 'LONG', 'UP', {
        macroTrend: 'UP',
        h1Confidence: 100,
        h1Direction: 'LONG',
      }),
      2
    );
    assert.equal(
      passesMtfAlignmentGate({
        timeframes: tfs,
        tradeDirection: 'LONG',
        htfTrend1h: 'UP',
        minDirectionalTfs: 2,
        macroTrend: 'UP',
        h1Confidence: 100,
        h1Direction: 'LONG',
      }).ok,
      true
    );
  });

  it('macro dump anchor — symmetric SHORT mirror', () => {
    const tfs = [
      { timeframe: '5m', direction: 'LONG' as const },
      { timeframe: '15m', direction: 'LONG' as const },
      { timeframe: '1h', direction: 'SHORT' as const },
    ];
    assert.equal(
      passesMtfAlignmentGate({
        timeframes: tfs,
        tradeDirection: 'SHORT',
        htfTrend1h: 'DOWN',
        minDirectionalTfs: 2,
        macroTrend: 'DOWN',
        h1Confidence: 95,
        h1Direction: 'SHORT',
      }).ok,
      true
    );
  });

  it('trend-following LONG passes when 15m and 1h align', () => {
    const tfs = [
      { timeframe: '5m', direction: 'SHORT' as const },
      { timeframe: '15m', direction: 'LONG' as const },
      { timeframe: '1h', direction: 'LONG' as const },
    ];
    assert.equal(computeDirectionalTfCount(tfs, 'LONG', 'UP'), 2);
    assert.equal(
      passesMtfAlignmentGate({
        timeframes: tfs,
        tradeDirection: 'LONG',
        htfTrend1h: 'UP',
        minDirectionalTfs: 2,
      }).ok,
      true
    );
  });

  it('macro anchor dampens counter-TF weights symmetrically', () => {
    const longPump = macroTrendWeightMultipliers({
      timeframe: '15m',
      tfDirection: 'SHORT',
      tradeDirection: 'LONG',
      macroAnchor: true,
    });
    const shortDump = macroTrendWeightMultipliers({
      timeframe: '15m',
      tfDirection: 'LONG',
      tradeDirection: 'SHORT',
      macroAnchor: true,
    });
    assert.ok(longPump.trendMult < 0.3);
    assert.equal(longPump.trendMult, shortDump.trendMult);
  });

  it('reversal SHORT requires 5m and 15m', () => {
    assert.equal(isTrendFollowing('SHORT', 'UP'), false);
    assert.equal(
      meetsReversalTfRequirement(
        [
          { timeframe: '5m', direction: 'SHORT' },
          { timeframe: '15m', direction: 'HOLD' },
          { timeframe: '1h', direction: 'LONG' },
        ],
        'SHORT'
      ),
      false
    );
    assert.equal(
      meetsReversalTfRequirement(
        [
          { timeframe: '5m', direction: 'SHORT' },
          { timeframe: '15m', direction: 'SHORT' },
        ],
        'SHORT'
      ),
      true
    );
  });
});
