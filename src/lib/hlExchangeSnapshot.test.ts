import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHlExchangeSnapshot,
  HL_MARK_STALE_MS,
  HL_POSITION_STALE_MS,
  snapshotScopedUpnl,
} from './hlExchangeSnapshot';
import type { HlPosition } from './hyperliquid/user';

const eth: HlPosition = {
  coin: 'ETH',
  szi: '-0.5',
  entryPx: '100',
  positionValue: '50',
  unrealizedPnl: '-1',
  leverage: { type: 'isolated', value: 10 },
  liquidationPx: null,
};

describe('hlExchangeSnapshot', () => {
  it('marks stale when marks and positions exceed thresholds', () => {
    const now = 1_000_000;
    const snap = buildHlExchangeSnapshot({
      wallet: '0xabc',
      positions: [eth],
      marks: { ETH: 102 },
      openOrders: [],
      positionsAsOfMs: now - HL_POSITION_STALE_MS - 1,
      marksAsOfMs: now - HL_MARK_STALE_MS - 1,
      marksWsLive: false,
      nowMs: now,
    });
    assert.equal(snap.stale, true);
    assert.ok(snap.positionsStale);
    assert.ok(snap.marksStale);
  });

  it('scoped bot uPnL uses one mark map for all scoped rows', () => {
    const snap = buildHlExchangeSnapshot({
      wallet: '0xabc',
      positions: [eth],
      marks: { ETH: 102 },
      openOrders: [],
      positionsAsOfMs: Date.now(),
      marksAsOfMs: Date.now(),
      marksWsLive: true,
    });
    const bot = snapshotScopedUpnl(snap, new Set(['ETH']), 'bot');
    assert.ok(Math.abs(bot.totalUsd - (-1)) < 0.01);
    assert.equal(bot.byCoin.ETH, bot.totalUsd);
  });

  it('partial fill: smaller size changes uPnL with same mark', () => {
    const half: HlPosition = { ...eth, szi: '-0.25' };
    const fullTotal = buildHlExchangeSnapshot({
      wallet: '0xabc',
      positions: [eth],
      marks: { ETH: 102 },
      openOrders: [],
      positionsAsOfMs: Date.now(),
      marksAsOfMs: Date.now(),
      marksWsLive: true,
    }).upnlTotalUsd;
    const halfTotal = buildHlExchangeSnapshot({
      wallet: '0xabc',
      positions: [half],
      marks: { ETH: 102 },
      openOrders: [],
      positionsAsOfMs: Date.now(),
      marksAsOfMs: Date.now(),
      marksWsLive: true,
    }).upnlTotalUsd;
    assert.notEqual(fullTotal, halfTotal);
    assert.ok(Math.abs(halfTotal) < Math.abs(fullTotal));
  });
});
