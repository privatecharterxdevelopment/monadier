import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldAllowBotFlatten } from './botExitPolicy';

describe('botExitPolicy', () => {
  it('blocks trailing_stop when uPnL or net is red', () => {
    const red = shouldAllowBotFlatten({
      reason: 'trailing_stop',
      pnlUsd: -0.2,
      netPnlUsd: -0.3,
      profitOnlyExits: true,
    });
    assert.equal(red.ok, false);
    const thin = shouldAllowBotFlatten({
      reason: 'trailing_stop',
      pnlUsd: 0.02,
      netPnlUsd: -0.01,
      profitOnlyExits: true,
    });
    assert.equal(thin.ok, false);
  });

  it('blocks fail-safe loss flatten when user SL is 0 (profit trail)', () => {
    assert.equal(
      shouldAllowBotFlatten({
        reason: 'sl_fail_safe_flatten',
        pnlUsd: -4,
        netPnlUsd: -4.2,
        profitOnlyExits: true,
        userStopLossPct: 0,
      }).ok,
      false
    );
    assert.equal(
      shouldAllowBotFlatten({
        reason: 'sl_fail_safe_flatten',
        pnlUsd: -4,
        netPnlUsd: -4.2,
        profitOnlyExits: true,
        userStopLossPct: 15,
      }).ok,
      true
    );
  });

  it('allows manual while red', () => {
    assert.equal(
      shouldAllowBotFlatten({
        reason: 'manual',
        pnlUsd: -1,
        netPnlUsd: -1,
        profitOnlyExits: true,
      }).ok,
      true
    );
  });
});
