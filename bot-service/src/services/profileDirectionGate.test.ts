import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BEAR_MARKET } from '../config/profiles/bearMarketShort';
import { BULL_MARKET } from '../config/profiles/bullMarketLong';
import {
  isDirectionOpenAllowedForProfile,
  profileDirectionBlockReason,
} from './profileDirectionGate';

describe('profileDirectionGate', () => {
  it('BEAR allows LONG counter-trend and SHORT primary', () => {
    assert.equal(isDirectionOpenAllowedForProfile(BEAR_MARKET, 'LONG'), true);
    assert.equal(isDirectionOpenAllowedForProfile(BEAR_MARKET, 'SHORT'), true);
  });

  it('BULL allows LONG and SHORT at profile level (coin MTF picks side)', () => {
    assert.equal(isDirectionOpenAllowedForProfile(BULL_MARKET, 'LONG'), true);
    assert.equal(isDirectionOpenAllowedForProfile(BULL_MARKET, 'SHORT'), true);
  });

  it('BEAR allows both directions at profile level', () => {
    assert.equal(isDirectionOpenAllowedForProfile(BEAR_MARKET, 'LONG'), true);
    assert.equal(isDirectionOpenAllowedForProfile(BEAR_MARKET, 'SHORT'), true);
  });
});
