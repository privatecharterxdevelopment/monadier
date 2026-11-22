import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCloseFills } from './hlExchangeCloseBackfill';

describe('exchange close backfill — multi-fill aggregation', () => {
  it('ADA SHORT closed in 2 fills → one close, PnL summed (−7.88, not −3.56)', () => {
    const t = 1_795_000_000_000;
    const closes = aggregateCloseFills([
      { coin: 'ADA', dir: 'Close Short', side: 'B', px: '0.14584', sz: '783', closedPnl: '-3.56265', fee: '0.051', time: t, oid: 1 },
      { coin: 'ADA', dir: 'Close Short', side: 'B', px: '0.14584', sz: '949', closedPnl: '-4.31795', fee: '0.062', time: t, oid: 1 },
    ]);
    assert.equal(closes.length, 1);
    const c = closes[0];
    assert.equal(c.direction, 'SHORT');
    assert.equal(c.size, 1732);
    assert.equal(c.grossPnl, -7.8806);
    assert.equal(c.feeUsd, 0.113);
    assert.equal(c.netPnl, -7.9936);
    assert.deepEqual(c.partPnls, [-3.56265, -4.31795]);
  });

  it('separate closes (different oid, > 3s apart) stay separate; opens ignored', () => {
    const t = 1_795_000_000_000;
    const closes = aggregateCloseFills([
      { coin: 'ETH', dir: 'Open Long', side: 'B', px: '3000', sz: '1', closedPnl: '0', time: t - 60_000, oid: 9 },
      { coin: 'ETH', dir: 'Close Long', side: 'A', px: '3010', sz: '0.5', closedPnl: '5', time: t, oid: 10 },
      { coin: 'ETH', dir: 'Close Long', side: 'A', px: '3020', sz: '0.5', closedPnl: '10', time: t + 60_000, oid: 11 },
    ]);
    assert.equal(closes.length, 2);
    assert.equal(closes[0].grossPnl, 5);
    assert.equal(closes[1].grossPnl, 10);
  });
});
