import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BEAR_MARKET } from '../config/profiles/bearMarketShort';
import { BULL_MARKET } from '../config/profiles/bullMarketLong';
import {
  isDirectionOpenAllowedForProfile,
  profileDirectionBlockReason,
} from './profileDirectionGate';

describe('profileDirectionGate', () => {
  it('BEAR is SHORT-primary — no auto LONG opens', () => {
    assert.equal(isDirectionOpenAllowedForProfile(BEAR_MARKET, 'LONG'), false);
    assert.equal(isDirectionOpenAllowedForProfile(BEAR_MARKET, 'SHORT'), true);
  });

  it('BULL allows LONG and SHORT at profile level (coin MTF picks side)', () => {
    assert.equal(isDirectionOpenAllowedForProfile(BULL_MARKET, 'LONG'), true);
    assert.equal(isDirectionOpenAllowedForProfile(BULL_MARKET, 'SHORT'), true);
  });

  it('BEAR blocks LONG at profile gate with reason', () => {
    const reason = profileDirectionBlockReason(BEAR_MARKET, 'LONG');
    assert.match(reason, /allowLongOpens=false/);
  });
});
