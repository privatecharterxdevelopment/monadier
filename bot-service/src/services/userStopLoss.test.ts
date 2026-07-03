import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Mirror of positionThesisGate.effectiveStopLossPct — must stay in sync. */
function effectiveStopLossPct(userSlPct: number, maxCeiling = 18): number {
  if (userSlPct <= 0) return 0;
  return Math.min(userSlPct, maxCeiling);
}

function computeMaxLossCapUsd(collateralUsd: number, slPct: number, maxCeiling = 18): number {
  const effective = effectiveStopLossPct(slPct, maxCeiling);
  return effective > 0 && collateralUsd > 0 ? collateralUsd * (effective / 100) : 0;
}

function shouldHardLossClose(
  pnlUsd: number,
  collateralUsd: number,
  slPct: number,
  maxCeiling = 18
): boolean {
  if (pnlUsd >= 0) return false;
  const cap = computeMaxLossCapUsd(collateralUsd, slPct, maxCeiling);
  return cap > 0 && pnlUsd <= -cap;
}

describe('user stop loss (vault_settings stop_loss_percent)', () => {
  it('honors per-user SL% — never zeroed by profitOnlyExits', () => {
    assert.equal(effectiveStopLossPct(3), 3);
    assert.equal(effectiveStopLossPct(5), 5);
    assert.equal(effectiveStopLossPct(0), 0);
  });

  it('caps user SL at maxAutoStopLossPct ceiling', () => {
    assert.equal(effectiveStopLossPct(50), 18);
  });

  it('closes when uPnL breaches user margin SL cap', () => {
    const collateral = 100;
    const slPct = 3;
    const cap = computeMaxLossCapUsd(collateral, slPct);
    assert.equal(cap, 3);
    assert.equal(shouldHardLossClose(-3, collateral, slPct), true);
    assert.equal(shouldHardLossClose(-2.99, collateral, slPct), false);
  });

  it('different users can have different SL thresholds', () => {
    assert.equal(shouldHardLossClose(-2, 100, 2), true);
    assert.equal(shouldHardLossClose(-2, 100, 5), false);
    assert.equal(shouldHardLossClose(-6, 100, 5), true);
  });
});
