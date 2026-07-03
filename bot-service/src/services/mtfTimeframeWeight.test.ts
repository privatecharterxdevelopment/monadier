import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDirectionalTfCount,
  isTrendFollowing,
  meetsReversalTfRequirement,
  passesMtfAlignmentGate,
} from './mtfTimeframeWeight';

describe('mtfTimeframeWeight', () => {
  const xrpPumpTfs = [
    { timeframe: '5m', direction: 'LONG' as const },
    { timeframe: '15m', direction: 'SHORT' as const },
    { timeframe: '1h', direction: 'LONG' as const },
  ];

  it('trend-following LONG ignores 5m vote — XRP pump case', () => {
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
