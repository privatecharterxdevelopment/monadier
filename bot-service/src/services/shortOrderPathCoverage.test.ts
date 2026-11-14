/**
 * Static + behavioral checks: every SHORT order path runs final quality before submit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const hlTradingSrc = readFileSync(
  join(process.cwd(), 'src/services/hlTrading.ts'),
  'utf8'
);

describe('SHORT order path — short_entry_quality coverage', () => {
  it('calls evaluateShortEntryQualityPreSubmit before client.order', () => {
    const preSubmit = hlTradingSrc.indexOf('evaluateShortEntryQualityPreSubmit');
    const orderCall = hlTradingSrc.indexOf('await client.order');
    assert.ok(preSubmit > 0 && orderCall > preSubmit, 'quality must run before client.order');
  });

  it('blocks SHORT when quality fails (not conditional on skipOpenGates)', () => {
    const block = hlTradingSrc.indexOf('if (!shortQuality.ok)');
    assert.ok(block > 0, 'short quality failure must return failOpen');
    const chunk = hlTradingSrc.slice(block, block + 80);
    assert.match(chunk, /if \(!shortQuality\.ok\)[\s\S]{0,60}return failOpen/);
    assert.doesNotMatch(chunk, /if \(!skipOpenGates\)/);
  });

  it('force-open and manual paths only skip gates via openMarketPosition flag', () => {
    assert.ok(hlTradingSrc.includes('skipOpenGates: true'));
    assert.ok(hlTradingSrc.includes('forceOpenForAutoTradeUsers'));
    assert.ok(hlTradingSrc.includes('placeManualPerpOrder'));
  });
});