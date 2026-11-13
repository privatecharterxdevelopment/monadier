import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parseDirectionProfileBoot } from './liveDirectionProfile';

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
});
