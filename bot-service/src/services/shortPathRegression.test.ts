/**
 * SHORT decision path lock vs pre-reversal commit (77479a0).
 * Reversal work must not change SHORT scan TFs, profile bars, or wallet cooldown.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BEAR_MARKET } from '../config/profiles/bearMarketShort';
import { analysisTimeframesForDirection } from '../config/directionProfiles';
import { evaluateWalletReentry, isOpenCooldownBlocked, rememberCoinClose } from './hlCoinCloseGuard';
import { config } from '../config';

describe('SHORT path regression vs prior bear engine', () => {
  it('SHORT analysis stack remains 1m/5m/15m/1h', () => {
    assert.deepEqual(analysisTimeframesForDirection('SHORT'), ['1m', '5m', '15m', '1h']);
  });

  it('bear SHORT profile bars are unchanged', () => {
    const s = BEAR_MARKET.short;
    assert.equal(s.minConfidence, 58);
    assert.equal(s.minDirectionalTfs, 3);
    assert.equal(s.minTrendAlignment, 55);
    assert.equal(s.requiredH1Trend, 'DOWN');
    assert.equal(s.required15mTrend, 'DOWN');
    assert.equal(s.required5mTrend, undefined);
    assert.equal(s.minConfirm15mCandles, 3);
    assert.equal(s.trustMtfScan, true);
    assert.equal(s.relaxSecondaryGates, true);
    assert.equal(s.bypassFreshPumpWhenTrusted, true);
    assert.equal(s.bypassMacroBetaWhenTrusted, true);
    assert.equal(s.bypassPumpShortWhenTrusted, true);
    assert.equal(s.bypassEntryLocationWhenTrusted, false);
    assert.equal(s.bypassScalpAlignWhenTrusted, false);
  });

  it('wallet-wide 1h blocks a SHORT on another coin minutes after any close', () => {
    const wallet = '0x2222222222222222222222222222222222222222';
    rememberCoinClose(wallet, 'SOL', 'LONG', Date.now() - 3 * 60_000);
    const r = isOpenCooldownBlocked(wallet, 'BTC', 'SHORT');
    assert.equal(r.blocked, true);
    assert.equal(r.guard, 'wallet');
    const wait = evaluateWalletReentry(Date.now() - 3 * 60_000);
    assert.equal(wait.blocked, true);
    assert.ok(config.hyperliquid.reentryCooldownMs >= 60 * 60 * 1000);
    const sameSol = isOpenCooldownBlocked(wallet, 'SOL', 'LONG');
    assert.equal(sameSol.blocked, true);
    assert.equal(sameSol.guard, 'same-coin');
  });

  it('REVERSAL_LONG exception does not apply to SHORT', () => {
    const wallet = '0x3333333333333333333333333333333333333333';
    rememberCoinClose(wallet, 'BTC', 'LONG', Date.now() - 3 * 60_000);
    const r = isOpenCooldownBlocked(wallet, 'BTC', 'SHORT', { reversalLong: true });
    assert.equal(r.blocked, true);
  });
});
