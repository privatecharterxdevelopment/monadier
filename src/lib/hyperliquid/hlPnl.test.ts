import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  (globalThis as { document?: { documentElement: { lang: string } } }).document = {
    documentElement: { lang: 'en' },
  };
});

describe('netHlClosePnl', () => {
  it('matches dock history net (closedPnl minus HL fee)', async () => {
    const { netHlClosePnl } = await import('./hlPnl');
    expect(
      netHlClosePnl({
        closedPnl: '-0.0136',
        fee: '0.2324',
        coin: 'PAXG',
        px: '3826',
        sz: '0.135',
        side: 'B',
        time: 1,
        dir: 'Close Short',
      })
    ).toBeCloseTo(-0.246, 3);
  });
});

describe('close fill notification grouping', () => {
  it('uses aggregated net when one slice had positive gross only', async () => {
    const { aggregateHlCloseFills } = await import('./hlFillAggregate');
    const { netHlClosePnl } = await import('./hlPnl');
    const fills = [
      {
        coin: 'PAXG',
        px: '3826',
        sz: '0.05',
        side: 'B',
        time: 1_000,
        closedPnl: '0.013',
        fee: '0.08',
        dir: 'Close Short',
        tid: 1,
        oid: 1,
      },
      {
        coin: 'PAXG',
        px: '3826',
        sz: '0.085',
        side: 'B',
        time: 1_200,
        closedPnl: '-0.0266',
        fee: '0.1524',
        dir: 'Close Short',
        tid: 2,
        oid: 1,
      },
    ];
    const rows = aggregateHlCloseFills(fills);
    expect(rows).toHaveLength(1);
    expect(netHlClosePnl(rows[0]!)).toBeCloseTo(-0.246, 3);
  });
});