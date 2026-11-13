import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // format.ts → i18n touches document at import time
  (globalThis as { document?: { documentElement: { lang: string } } }).document = {
    documentElement: { lang: 'en' },
  };
});

describe('aggregateHlCloseFills', () => {
  it('merges multi-second close fills into one row with summed pnl', async () => {
    const { aggregateHlCloseFills } = await import('./hlFillAggregate');
    const fills = [
      {
        coin: 'PUMP',
        px: '0.002',
        sz: '100',
        side: 'B',
        time: 1_000,
        closedPnl: '0.300',
        fee: '0.01',
        dir: 'Close Short',
        tid: 1,
        oid: 9,
      },
      {
        coin: 'PUMP',
        px: '0.002',
        sz: '200',
        side: 'B',
        time: 3_500,
        closedPnl: '0.338',
        fee: '0.01',
        dir: 'Close Short',
        tid: 2,
        oid: 9,
      },
      {
        coin: 'PUMP',
        px: '0.002',
        sz: '338',
        side: 'B',
        time: 6_000,
        closedPnl: '0.642',
        fee: '0.01',
        dir: 'Close Short',
        tid: 3,
        oid: 9,
      },
    ];
    const rows = aggregateHlCloseFills(fills);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].closedPnl)).toBeCloseTo(1.28, 5);
    expect(rows[0].fillCount).toBe(3);
  });

  it('subtracts deposits when walking backward (balance after aligns with equity)', async () => {
    const { aggregateHlCloseFills, aggregatedCloseFillKey, balanceAfterByCloseFill } =
      await import('./hlFillAggregate');
    const fills = [
      {
        coin: 'AAVE',
        px: '1',
        sz: '1',
        side: 'B',
        time: 1_000_000,
        closedPnl: '0.5',
        fee: '0.01',
        dir: 'Close Short',
        oid: 1,
      },
    ];
    const closes = aggregateHlCloseFills(fills);
    const flatNow = 53;
    const flows = [{ time: 1_500_000, deltaUsd: 28 }];
    const map = balanceAfterByCloseFill(closes, flatNow, flows);
    const row = closes[0]!;
    expect(map.get(aggregatedCloseFillKey(row))).toBeCloseTo(25, 0);
  });

  it('does not merge unrelated closes minutes apart', async () => {
    const { aggregateHlCloseFills } = await import('./hlFillAggregate');
    const fills = [
      {
        coin: 'PUMP',
        px: '0.002',
        sz: '10',
        side: 'B',
        time: 1_000,
        closedPnl: '0.5',
        fee: '0.01',
        dir: 'Close Short',
        oid: 1,
      },
      {
        coin: 'PUMP',
        px: '0.002',
        sz: '8',
        side: 'B',
        time: 120_000,
        closedPnl: '0.4',
        fee: '0.01',
        dir: 'Close Short',
        oid: 2,
      },
    ];
    const rows = aggregateHlCloseFills(fills);
    expect(rows).toHaveLength(2);
  });
});
