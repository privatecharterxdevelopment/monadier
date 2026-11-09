import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  explainWouldArmAt,
  longBtcRunScenario,
  runProfitSlSimulation,
  sampleEmergencyLeg,
  sampleProfitLimitLeg,
  shortEthEarlyGreenScenario,
  solIncidentScenario,
} from './profitSlSimulation';

describe('profit SL simulations', () => {
  it('SOL incident: does not arm at +0.002% / first green; arms only past BE', async () => {
    const scenario = solIncidentScenario();
    const result = await runProfitSlSimulation(scenario);

    assert.ok(result.minArmPriceMovePct > 0.12, `economic arm ~0.2%+, got ${result.minArmPriceMovePct}`);
    assert.ok(result.minArmPriceMovePct < 0.6);

    assert.equal(explainWouldArmAt(scenario, 86.448, 5_000), false);
    assert.equal(explainWouldArmAt(scenario, 86.44, 5_000), false);

    for (const t of result.ticks) {
      if (t.tMs <= scenario.ticks[3].tMs) {
        assert.equal(t.stage, 0, `early mark ${t.mark} must stay unarmed`);
      }
    }

    assert.ok(result.armedAt, 'must arm once mark clears BE + gap');
    assert.ok(result.armedAt!.mark <= result.minArmMark + 0.05);
    assert.ok(result.armedAt!.stopPx <= result.beStopPx + 0.01);
    assert.ok(result.armedAt!.stopPx < scenario.entry);
    assert.ok(result.armedAt!.minLockUsd > 0);
    assert.ok(
      Math.abs(result.armedAt!.priceMovePct) >= 0.12,
      `armed at ${result.armedAt!.priceMovePct.toFixed(3)}% price, not 0.002%`
    );
    assert.equal(result.stopNeverWorsened, true);
    assert.equal(sampleProfitLimitLeg().t.trigger.isMarket, false);
    assert.equal(sampleEmergencyLeg().t.trigger.isMarket, true);
  });

  it('BTC LONG: first ticks stay stage 0, then BE lock, ratchet only up', async () => {
    const result = await runProfitSlSimulation(longBtcRunScenario());
    const first = result.ticks[1];
    assert.equal(first.stage, 0);
    assert.ok(result.armedAt);
    assert.ok(result.armedAt!.stopPx > result.entry);
    assert.equal(result.stopNeverWorsened, true);
    const stops = result.ticks.map((t) => t.stopPx).filter((s): s is number => s != null);
    for (let i = 1; i < stops.length; i += 1) {
      assert.ok(stops[i] + 1e-9 >= stops[i - 1], 'LONG stop must be non-decreasing');
    }
  });

  it('ETH SHORT stall: scratch green does not arm', async () => {
    const scenario = shortEthEarlyGreenScenario();
    assert.equal(explainWouldArmAt(scenario, 3199.5, 5_000), false);
    const result = await runProfitSlSimulation(scenario);
    const firstGreen = result.ticks[1];
    assert.equal(firstGreen.stage, 0);
    if (result.armedAt) {
      assert.ok(result.armedAt.stopPx < scenario.entry);
      assert.ok(result.armedAt.minLockUsd > 0);
    }
    assert.equal(result.stopNeverWorsened, true);
  });
});
