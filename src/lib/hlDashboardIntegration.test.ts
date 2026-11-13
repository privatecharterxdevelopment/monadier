import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertSnapshotUpnlAligned,
  buildHlExchangeSnapshot,
  snapshotScopedUpnl,
} from './hlExchangeSnapshot';
import type { HlOpenOrder, HlPosition } from './hyperliquid/user';

const eth: HlPosition = {
  coin: 'ETH',
  szi: '-0.38',
  entryPx: '1921',
  positionValue: '730',
  unrealizedPnl: '-1.07',
  leverage: { type: 'isolated', value: 25 },
  liquidationPx: null,
};

const xrp: HlPosition = {
  coin: 'XRP',
  szi: '-608',
  entryPx: '1.01',
  positionValue: '614',
  unrealizedPnl: '-0.3',
  leverage: { type: 'isolated', value: 10 },
  liquidationPx: null,
};

describe('dashboard snapshot integration', () => {
  it('header, dock, footer use one total when scope is wallet-wide', () => {
    const snap = buildHlExchangeSnapshot({
      wallet: '0xabc',
      positions: [eth, xrp],
      marks: { ETH: 1923.8, XRP: 1.009 },
      openOrders: [],
      positionsAsOfMs: Date.now(),
      marksAsOfMs: Date.now(),
      marksWsLive: true,
    });
    const footerTotal = snap.upnlTotalUsd;
    const botScoped = snapshotScopedUpnl(snap, new Set(), 'bot');
    const headerBot = assertSnapshotUpnlAligned(snap, new Set(), 'bot');
    assert.equal(headerBot.totalUsd, botScoped.totalUsd);
    assert.equal(footerTotal, botScoped.totalUsd);
  });

  it('partial fill size change updates snapshot total without duplicate marks', () => {
    const before = buildHlExchangeSnapshot({
      wallet: '0xabc',
      positions: [{ ...eth, szi: '-0.38' }],
      marks: { ETH: 1923.8 },
      openOrders: [],
      positionsAsOfMs: 1,
      marksAsOfMs: 1,
      marksWsLive: true,
    });
    const after = buildHlExchangeSnapshot({
      wallet: '0xabc',
      positions: [{ ...eth, szi: '-0.19' }],
      marks: { ETH: 1923.8 },
      openOrders: [],
      positionsAsOfMs: 2,
      marksAsOfMs: 2,
      marksWsLive: true,
    });
    assert.notEqual(before.upnlTotalUsd, after.upnlTotalUsd);
  });

  it('open order revision does not change uPnL math (stops verified separately)', () => {
    const order: HlOpenOrder = {
      coin: 'ETH',
      side: 'B',
      limitPx: '1918',
      sz: '0.38',
      oid: 123,
      timestamp: 1,
      orderType: 'Stop Market',
      reduceOnly: true,
      isTrigger: true,
      triggerPx: '1918',
    };
    const a = buildHlExchangeSnapshot({
      wallet: '0xabc',
      positions: [eth],
      marks: { ETH: 1923 },
      openOrders: [],
      positionsAsOfMs: 1,
      marksAsOfMs: 1,
      marksWsLive: true,
    });
    const b = buildHlExchangeSnapshot({
      wallet: '0xabc',
      positions: [eth],
      marks: { ETH: 1923 },
      openOrders: [order],
      positionsAsOfMs: 1,
      marksAsOfMs: 1,
      marksWsLive: true,
    });
    assert.equal(a.upnlTotalUsd, b.upnlTotalUsd);
    assert.equal(b.openOrders.length, 1);
  });
});
