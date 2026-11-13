import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { BEAR_MARKET } from '../config/profiles/bearMarketShort';
import { BULL_MARKET } from '../config/profiles/bullMarketLong';
import {
  applyOpsDirectionOverridesToProfile,
  parseDirectionProfileBoot,
} from './liveDirectionProfile';
import { isDirectionOpenAllowedForProfile } from './profileDirectionGate';

describe('parseDirectionProfileBoot', () => {
  it('auto and btc enable AUTO mode', () => {
    assert.deepEqual(parseDirectionProfileBoot('auto'), { mode: 'auto', forcedName: null });
    assert.deepEqual(parseDirectionProfileBoot('btc'), { mode: 'auto', forcedName: null });
    assert.deepEqual(parseDirectionProfileBoot('AUTO'), { mode: 'auto', forcedName: null });
  });

  it('forced bear aliases unchanged', () => {
    for (const v of ['bear_market', 'bear', 'short', 'short_friendly', '']) {
      assert.equal(parseDirectionProfileBoot(v).mode, 'forced');
      assert.equal(parseDirectionProfileBoot(v).forcedName, 'bear_market');
    }
  });

  it('forced bull aliases unchanged', () => {
    for (const v of ['bull_market', 'bull', 'long']) {
      assert.equal(parseDirectionProfileBoot(v).mode, 'forced');
      assert.equal(parseDirectionProfileBoot(v).forcedName, 'bull_market');
    }
  });

  it('unknown values stay forced bear (production default)', () => {
    assert.deepEqual(parseDirectionProfileBoot('typo'), {
      mode: 'forced',
      forcedName: 'bear_market',
    });
  });
});

describe('ops kill switches HL_ALLOW_*', () => {
  const prevShort = process.env.HL_ALLOW_SHORT_OPENS;
  const prevLong = process.env.HL_ALLOW_LONG_OPENS;

  afterEach(() => {
    if (prevShort === undefined) delete process.env.HL_ALLOW_SHORT_OPENS;
    else process.env.HL_ALLOW_SHORT_OPENS = prevShort;
    if (prevLong === undefined) delete process.env.HL_ALLOW_LONG_OPENS;
    else process.env.HL_ALLOW_LONG_OPENS = prevLong;
  });

  it('SHORT kill-switch applies in BEAR', () => {
    process.env.HL_ALLOW_SHORT_OPENS = 'false';
    const p = applyOpsDirectionOverridesToProfile(BEAR_MARKET);
    assert.equal(p.allowShortOpens, false);
    assert.equal(isDirectionOpenAllowedForProfile(p, 'SHORT'), false);
    assert.equal(isDirectionOpenAllowedForProfile(p, 'LONG'), true);
  });

  it('SHORT kill-switch applies in BULL', () => {
    process.env.HL_ALLOW_SHORT_OPENS = 'false';
    const p = applyOpsDirectionOverridesToProfile(BULL_MARKET);
    assert.equal(p.allowShortOpens, false);
  });

  it('LONG kill-switch applies in BEAR and BULL', () => {
    process.env.HL_ALLOW_LONG_OPENS = 'false';
    const bear = applyOpsDirectionOverridesToProfile(BEAR_MARKET);
    const bull = applyOpsDirectionOverridesToProfile(BULL_MARKET);
    assert.equal(bear.allowLongOpens, false);
    assert.equal(bull.allowLongOpens, false);
  });
});

describe('AUTO wiring in entry path (static)', () => {
  it('hlTrading enforces profile direction and AUTO regime gate', () => {
    const src = readFileSync(new URL('./hlTrading.ts', import.meta.url), 'utf8');
    assert.match(src, /shouldBlockNewEntriesForAutoRegime/);
    assert.match(src, /isProfileDirectionOpenAllowed/);
    assert.match(src, /direction_profile/);
  });

  it('globalMarketScan filters signals by profile direction', () => {
    const src = readFileSync(new URL('./globalMarketScan.ts', import.meta.url), 'utf8');
    assert.match(src, /isProfileDirectionOpenAllowed/);
  });

  it('trading cycle refreshes live direction profile each pass', () => {
    const src = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    assert.match(src, /await refreshLiveDirectionProfile\(\)/);
  });

  it('force-open and manual paths use openMarketPosition (direction_profile gate)', () => {
    const src = readFileSync(new URL('./hlTrading.ts', import.meta.url), 'utf8');
    const force = src.slice(src.indexOf('admin force-open'));
    assert.match(force, /openMarketPosition\(/);
    const manual = src.slice(src.indexOf('placeManualPerpOrder'));
    assert.match(manual, /openMarketPosition\(/);
    const openFn = src.slice(src.indexOf('async openMarketPosition'));
    assert.match(openFn, /isProfileDirectionOpenAllowed\(opts.direction\)/);
  });
});
