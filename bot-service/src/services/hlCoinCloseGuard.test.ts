import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { config } from '../config';
import {
  evaluateWalletReentry,
  isOpenCooldownBlocked,
  isSameCoinOpenBlockedSync,
  rememberCoinClose,
} from './hlCoinCloseGuard';

const ONE_HOUR = 60 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;

describe('post-close cooldown (wallet-wide off by default, 1h same-coin)', () => {
  it('config: wallet re-entry off; same-coin floors remain', () => {
    assert.equal(config.hyperliquid.reentryCooldownMs, 0);
    assert.ok(config.hyperliquid.sameCoinReentryMinMs >= ONE_HOUR);
    assert.ok(config.hyperliquid.blockOppositeSameCoinMs >= TEN_MIN);
  });

  it('wallet-wide re-entry does not block when cooldown is 0', () => {
    const now = Date.now();
    const r = evaluateWalletReentry(now - 30 * 60_000, now);
    assert.equal(r.blocked, false);
  });

  it('wallet-wide re-entry blocks only when HL_REENTRY_COOLDOWN_MS is set', () => {
    const prev = config.hyperliquid.reentryCooldownMs;
    (config.hyperliquid as { reentryCooldownMs: number }).reentryCooldownMs = ONE_HOUR;
    const now = Date.now();
    try {
      assert.equal(evaluateWalletReentry(now - 30 * 60_000, now).blocked, true);
      assert.equal(evaluateWalletReentry(now - 61 * 60_000, now).blocked, false);
    } finally {
      (config.hyperliquid as { reentryCooldownMs: number }).reentryCooldownMs = prev;
    }
  });

  it('does not wait when the wallet has never closed', () => {
    const r = evaluateWalletReentry(0);
    assert.equal(r.blocked, false);
  });

  it('blocks same-coin re-entry under 1 hour', () => {
    const wallet = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    rememberCoinClose(wallet, 'ETH', 'SHORT', Date.now() - 60_000);
    const r = isSameCoinOpenBlockedSync(wallet, 'ETH', 'SHORT');
    assert.equal(r.blocked, true);
    assert.match(r.reason ?? '', /re-entry blocked/);
  });

  it('allows same-coin re-entry after 1 hour', () => {
    const wallet = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    rememberCoinClose(wallet, 'ETH', 'SHORT', Date.now() - 61 * 60_000);
    const r = isSameCoinOpenBlockedSync(wallet, 'ETH', 'SHORT');
    assert.equal(r.blocked, false);
  });

  it('8 SHORT close then REVERSAL_LONG is not blocked by anti-flip after 2m', () => {
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

  it('wallet-wide 1h blocks SHORT and TREND_LONG on another coin after any close', () => {
    const wallet = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    rememberCoinClose(wallet, 'ETH', 'SHORT', Date.now() - 3 * 60_000);
    const shortBtc = isOpenCooldownBlocked(wallet, 'BTC', 'SHORT');
    assert.equal(shortBtc.blocked, true);
    assert.equal(shortBtc.guard, 'wallet');
    const trendLong = isOpenCooldownBlocked(wallet, 'BTC', 'LONG');
    assert.equal(trendLong.blocked, true);
    const sameEth = isOpenCooldownBlocked(wallet, 'ETH', 'SHORT');
    assert.equal(sameEth.blocked, true);
    assert.equal(sameEth.guard, 'same-coin');
  });

  it('REVERSAL_LONG after this coin SHORT skips stacked wallet 1h once 2m passed', () => {
    const wallet = '0xffffffffffffffffffffffffffffffffffffffff';
    rememberCoinClose(wallet, 'BTC', 'SHORT', Date.now() - 3 * 60_000);
    const r = isOpenCooldownBlocked(wallet, 'BTC', 'LONG', { reversalLong: true });
    assert.equal(r.blocked, false);
  });

  it('REVERSAL_LONG on BTC still waits wallet 1h if last close was another coin', () => {
    const wallet = '0x1111111111111111111111111111111111111111';
    rememberCoinClose(wallet, 'BTC', 'SHORT', Date.now() - 58 * 60_000);
    rememberCoinClose(wallet, 'ETH', 'SHORT', Date.now() - 60_000);
    const r = isOpenCooldownBlocked(wallet, 'BTC', 'LONG', { reversalLong: true });
    assert.equal(r.blocked, true);
    assert.equal(r.guard, 'wallet');
    const eth = isOpenCooldownBlocked(wallet, 'ETH', 'SHORT');
    assert.equal(eth.blocked, true);
    assert.equal(eth.guard, 'same-coin');
  });

  it('REVERSAL_LONG 90s after same-coin SHORT still hits 2m floor', () => {
    const wallet = '0x4444444444444444444444444444444444444444';
    rememberCoinClose(wallet, 'BTC', 'SHORT', Date.now() - 90_000);
    const r = isOpenCooldownBlocked(wallet, 'BTC', 'LONG', { reversalLong: true });
    assert.equal(r.blocked, true);
    assert.equal(r.guard, 'same-coin');
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
