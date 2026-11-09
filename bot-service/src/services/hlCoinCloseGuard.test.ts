import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { config } from '../config';
import {
  evaluateWalletReentry,
  isSameCoinOpenBlockedSync,
  rememberCoinClose,
} from './hlCoinCloseGuard';

const TEN_MIN = 10 * 60 * 1000;

describe('post-close cooldown (min 10 minutes)', () => {
  it('config floors are at least 10 minutes', () => {
    assert.ok(config.hyperliquid.reentryCooldownMs >= TEN_MIN);
    assert.ok(config.hyperliquid.sameCoinReentryMinMs >= TEN_MIN);
    assert.ok(config.hyperliquid.blockOppositeSameCoinMs >= TEN_MIN);
  });

  it('blocks a new open 9 minutes after the last wallet close', () => {
    const now = Date.now();
    const r = evaluateWalletReentry(now - 9 * 60_000, now);
    assert.equal(r.blocked, true);
    assert.match(r.reason ?? '', /min 10m/);
  });

  it('allows a new open 11 minutes after the last wallet close', () => {
    const now = Date.now();
    const r = evaluateWalletReentry(now - 11 * 60_000, now);
    assert.equal(r.blocked, false);
  });

  it('does not wait when the wallet has never closed', () => {
    const r = evaluateWalletReentry(0);
    assert.equal(r.blocked, false);
  });

  it('blocks same-coin re-entry under 10 minutes', () => {
    const wallet = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    rememberCoinClose(wallet, 'ETH', 'SHORT', Date.now() - 60_000);
    const r = isSameCoinOpenBlockedSync(wallet, 'ETH', 'SHORT');
    assert.equal(r.blocked, true);
    assert.match(r.reason ?? '', /min 10m/);
  });

  it('allows same-coin re-entry after 10 minutes', () => {
    const wallet = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    rememberCoinClose(wallet, 'ETH', 'SHORT', Date.now() - 11 * 60_000);
    const r = isSameCoinOpenBlockedSync(wallet, 'ETH', 'SHORT');
    assert.equal(r.blocked, false);
  });

  it('8 SHORT close then REVERSAL_LONG is not blocked by 10m anti-flip after 2m', () => {
    const wallet = '0xcccccccccccccccccccccccccccccccccccccccc';
    rememberCoinClose(wallet, 'BTC', 'SHORT', Date.now() - 3 * 60_000);
    const sameShort = isSameCoinOpenBlockedSync(wallet, 'BTC', 'SHORT');
    assert.equal(sameShort.blocked, true);
    const flipDefault = isSameCoinOpenBlockedSync(wallet, 'BTC', 'LONG');
    assert.equal(flipDefault.blocked, true);
    const reversal = isSameCoinOpenBlockedSync(wallet, 'BTC', 'LONG', {
      reversalLong: true,
    });
    assert.equal(reversal.blocked, false);
  });

  it('immediate reverse after SHORT is still blocked (rate limit)', () => {
    const wallet = '0xdddddddddddddddddddddddddddddddddddddddd';
    rememberCoinClose(wallet, 'BTC', 'SHORT', Date.now() - 5_000);
    const reversal = isSameCoinOpenBlockedSync(wallet, 'BTC', 'LONG', {
      reversalLong: true,
    });
    assert.equal(reversal.blocked, true);
    assert.match(reversal.reason ?? '', /LONG_COOLDOWN_ACTIVE|anti-flip/);
  });
});
