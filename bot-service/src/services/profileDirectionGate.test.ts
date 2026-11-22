import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BEAR_MARKET } from '../config/profiles/bearMarketShort';
import { BULL_MARKET } from '../config/profiles/bullMarketLong';
import {
  isDirectionOpenAllowedForProfile,
  profileDirectionBlockReason,
} from './profileDirectionGate';

describe('profileDirectionGate', () => {
  it('BEAR is SHORT-primary but allows LONG (coin MTF picks side)', () => {
    assert.equal(isDirectionOpenAllowedForProfile(BEAR_MARKET, 'LONG'), true);
    assert.equal(isDirectionOpenAllowedForProfile(BEAR_MARKET, 'SHORT'), true);
  });

  it('BULL allows LONG and SHORT at profile level (coin MTF picks side)', () => {
    assert.equal(isDirectionOpenAllowedForProfile(BULL_MARKET, 'LONG'), true);
    assert.equal(isDirectionOpenAllowedForProfile(BULL_MARKET, 'SHORT'), true);
  });

  it('LONG kill-switch still yields a block reason', () => {
    const reason = profileDirectionBlockReason({ ...BEAR_MARKET, allowLongOpens: false }, 'LONG');
    assert.match(reason, /allowLongOpens=false/);
  });
});
