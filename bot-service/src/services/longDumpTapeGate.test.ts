import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { btcAnchorTapeHit } from './btcAnchorTape';

function candlesFromNets(nets: number[], start = 100): Array<{ open: number; close: number }> {
  let px = start;
  const built = nets.map((netPct) => {
    const open = px;
    const close = open * (1 + netPct / 100);
    px = close;
    return { open, close };
  });
  // Gate ignores the live incomplete bar (slice(0, -1)).
  return [...built, { open: px, close: px * 1.001 }];
}

test('btcAnchorTapeHit allows mild BTC dip (net ~-0.5%) that blocked all alt LONGs', () => {
  const c = candlesFromNets([-0.1, -0.1, -0.1, -0.1, -0.12]);
  assert.equal(btcAnchorTapeHit('BTC 1h', c, 5), null);
});

test('btcAnchorTapeHit blocks real BTC dump', () => {
  const c = candlesFromNets([-0.55, -0.45, -0.35, -0.25, -0.2]);
  const hit = btcAnchorTapeHit('BTC 15m', c, 5);
  assert.ok(hit && hit.includes('net -'));
});