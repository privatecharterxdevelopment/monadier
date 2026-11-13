import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSameCoinOpenBlockedSync, rememberCoinClose } from './hlCoinCloseGuard';
import {
  _resetHlOpenPositionSnapshotForTests,
  syncVanishedHlOpens,
} from './hlOpenPositionSnapshot';

describe('syncVanishedHlOpens (exchange / trail closes)', () => {
  const wallet = '0x9999999999999999999999999999999999999999';

  it('arms same-coin cooldown when a perp vanishes from clearinghouse', () => {
    _resetHlOpenPositionSnapshotForTests();
    syncVanishedHlOpens(wallet, [{ coin: 'USELESS', szi: '-673' }]);
    syncVanishedHlOpens(wallet, []);
    const block = isSameCoinOpenBlockedSync(wallet, 'USELESS', 'SHORT');
    assert.equal(block.blocked, true);
    assert.match(block.reason ?? '', /USELESS/);
  });

  it('does not false-trigger on first snapshot with no prior state', () => {
    _resetHlOpenPositionSnapshotForTests();
    syncVanishedHlOpens(wallet, [{ coin: 'BTC', szi: '-1' }]);
    const block = isSameCoinOpenBlockedSync(wallet, 'BTC', 'SHORT');
    assert.equal(block.blocked, false);
  });

  it('does not double-fire remember when coin stays open', () => {
    _resetHlOpenPositionSnapshotForTests();
    const at = Date.now() - 5 * 60_000;
    rememberCoinClose(wallet, 'ETH', 'SHORT', at);
    syncVanishedHlOpens(wallet, [{ coin: 'ETH', szi: '-10' }]);
    syncVanishedHlOpens(wallet, [{ coin: 'ETH', szi: '-10' }]);
    const block = isSameCoinOpenBlockedSync(wallet, 'ETH', 'SHORT');
    assert.equal(block.blocked, true);
  });
});
