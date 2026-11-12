import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  explainWouldArmAt,
  longBtcRunScenario,
  runProfitSlSimulation,
  sampleEmergencyLeg,
  sampleProfitLimitLeg,
  sampleProfitMarketLeg,
  shortEthEarlyGreenScenario,
  solIncidentScenario,
} from './profitSlSimulation';

describe('profit SL simulations', () => {
  it('SOL incident: first green uPnL>0 attempts activation; stop never loosens', async () => {
    const scenario = solIncidentScenario();
    const result = await runProfitSlSimulation(scenario);

    assert.equal(explainWouldArmAt(scenario, 86.1, 6_000), true);
    assert.equal(explainWouldArmAt(scenario, 86.448, 0), false);

    const firstGreen = result.ticks.find((t) => t.pnlUsd > 0);
    assert.ok(firstGreen, 'scenario must print a green tick');
    assert.ok(firstGreen!.tMs - scenario.ticks[0].tMs < 12_000);

    assert.equal(result.stopNeverWorsened, true);
    assert.equal(sampleProfitLimitLeg().t.trigger.isMarket, false);
    assert.equal(sampleProfitMarketLeg().t.trigger.isMarket, true);
    assert.ok(Number(sampleProfitMarketLeg().p) < 86.45);
    assert.ok(Number(sampleProfitMarketLeg().p) >= Number(sampleProfitMarketLeg().t.trigger.triggerPx));
    assert.equal(sampleEmergencyLeg().t.trigger.isMarket, true);
  });

  it('BTC LONG: first green activates; ratchet only up', async () => {
    const result = await runProfitSlSimulation(longBtcRunScenario());
    const firstGreen = result.ticks.find((t) => t.pnlUsd > 0);
    assert.ok(firstGreen);
    assert.equal(explainWouldArmAt(longBtcRunScenario(), 60_400, 6_000), true);
    assert.equal(result.stopNeverWorsened, true);
    const stops = result.ticks.map((t) => t.stopPx).filter((s): s is number => s != null);
    for (let i = 1; i < stops.length; i += 1) {
      assert.ok(stops[i] + 1e-9 >= stops[i - 1], 'LONG stop must be non-decreasing');
    }
  });

  it('ETH SHORT: would-arm after net-green + hold', async () => {
    const scenario = shortEthEarlyGreenScenario();
    assert.equal(explainWouldArmAt(scenario, 3190, 6_000), true);
    const result = await runProfitSlSimulation(scenario);
    const firstGreen = result.ticks.find((t) => t.pnlUsd > 0);
    assert.ok(firstGreen);
    if (result.armedAt) {
      assert.ok(result.armedAt.stopPx > result.armedAt.mark);
      assert.ok(result.armedAt.stopPx < scenario.entry);
    }
    assert.equal(result.stopNeverWorsened, true);
  });
});
