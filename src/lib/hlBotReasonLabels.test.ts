import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyHlCloseReason,
  historyCloseWhyShortLabel,
} from './hlBotReasonLabels';

describe('hlBotReasonLabels close Why', () => {
  it('classifies manual, trail, and exchange profit SL', () => {
    assert.equal(classifyHlCloseReason('manual'), 'manual');
    assert.equal(classifyHlCloseReason('trailing_stop'), 'bot_trail');
    assert.equal(classifyHlCloseReason('profit_grab_peak'), 'bot_trail');
    assert.equal(classifyHlCloseReason('profit_sl_exchange'), 'profit_sl_exchange');
    assert.equal(historyCloseWhyShortLabel('profit_sl_exchange'), 'Profit-SL (HL)');
    assert.equal(historyCloseWhyShortLabel('manual'), 'Manual');
    assert.equal(historyCloseWhyShortLabel('trailing_stop'), 'Bot trail');
  });
});