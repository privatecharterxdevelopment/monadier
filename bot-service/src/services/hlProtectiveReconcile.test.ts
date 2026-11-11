import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  blockNewEntriesUntilReconciled,
  reconcileProtectiveFromSnapshot,
  resetProtectiveReconcileForTests,
} from './hlProtectiveReconcile';

const WALLET = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('Railway restart protective reconcile', () => {
  beforeEach(() => {
    resetProtectiveReconcileForTests();
  });

  it('blocks new entries when open orders cannot be read', () => {
    const r = reconcileProtectiveFromSnapshot({
      wallet: WALLET,
      positions: [
        {
          coin: 'SOL',
          direction: 'SHORT',
          entryPx: 86.45,
          markPx: 86.1,
          absSize: 5.25,
          upnlUsd: 1.8,
          desiredStopPx: 86.35,
          armed: true,
          emergencyStopPx: 88.1,
          tickSize: 0.001,
        },
      ],
      orders: null,
      nowMs: 1,
      memoryStops: {},
    });
    assert.equal(r.ok, false);
    assert.equal(r.blockNewEntries, true);
    assert.equal(blockNewEntriesUntilReconciled(WALLET), true);
  });

  it('reconstructs the exchange profit floor with empty in-memory state and never loosens', () => {
    const r = reconcileProtectiveFromSnapshot({
      wallet: WALLET,
      positions: [
        {
          coin: 'SOL',
          direction: 'SHORT',
          entryPx: 86.45,
          markPx: 86.1,
          absSize: 5.25,
          upnlUsd: 1.8,
          desiredStopPx: 86.35,
          armed: true,
          emergencyStopPx: 88.1,
          tickSize: 0.001,
        },
      ],
      orders: [
        {
          coin: 'SOL',
          oid: 21,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: '86.20',
          limitPx: '86.44',
        },
        {
          coin: 'SOL',
          oid: 22,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: '88.10',
        },
      ],
      nowMs: 1,
      memoryStops: {},
    });
    assert.equal(r.ok, true);
    assert.equal(r.blockNewEntries, false);
    assert.equal(r.coins[0].reconstructedProfitPx, 86.2);
    assert.ok((r.coins[0].mergedProfitPx as number) <= 86.2);
    assert.equal(r.coins[0].neverLoosened, true);
    assert.equal(r.coins[0].firstProfitPlacement, false);
    assert.equal(r.coins[0].emergencyMissing, false);
  });

  it('prioritizes restoring a missing emergency SL and blocks new entries until it is back', () => {
    const r = reconcileProtectiveFromSnapshot({
      wallet: WALLET,
      positions: [
        {
          coin: 'SOL',
          direction: 'SHORT',
          entryPx: 86.45,
          markPx: 86.1,
          absSize: 5.25,
          upnlUsd: 1.8,
          desiredStopPx: null,
          armed: true,
          emergencyStopPx: 88.1,
          tickSize: 0.001,
        },
      ],
      orders: [
        {
          coin: 'SOL',
          oid: 21,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: '86.20',
          limitPx: '86.44',
        },
      ],
      nowMs: 1,
      memoryStops: {},
    });
    assert.equal(r.ok, false);
    assert.equal(r.blockNewEntries, true);
    assert.equal(r.coins[0].emergencyMissing, true);
    assert.equal(r.coins[0].postEmergencyPx, 88.1);
    assert.equal(r.coins[0].reconstructedProfitPx, 86.2);
  });
});
