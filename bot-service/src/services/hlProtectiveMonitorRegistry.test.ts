import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getRegisteredProtectiveMonitorWallets,
  mergePositionMonitorWallets,
  noteHlOpenPositions,
  registerHlProtectiveMonitorWallet,
} from './hlProtectiveMonitorRegistry';

describe('hlProtectiveMonitorRegistry', () => {
  it('keeps stopped-bot wallets with open perps in the monitor list', () => {
    const w = '0x1111111111111111111111111111111111111111';
    noteHlOpenPositions(w, ['BTC']);
    const merged = mergePositionMonitorWallets([], []);
    assert.ok(merged.includes(w));
    noteHlOpenPositions(w, []);
    const afterFlat = mergePositionMonitorWallets([], []);
    assert.ok(!afterFlat.includes(w));
  });

  it('merges auto-trade and registry without duplicates', () => {
    const a = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const b = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    registerHlProtectiveMonitorWallet(b);
    const merged = mergePositionMonitorWallets([a, b], [b]);
    assert.equal(merged.length, 2);
    assert.deepEqual(new Set(merged), new Set([a, b]));
    assert.equal(getRegisteredProtectiveMonitorWallets().includes(b), true);
  });
});
