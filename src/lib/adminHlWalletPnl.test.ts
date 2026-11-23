import { beforeAll, describe, expect, it } from 'vitest';
import type { HlUserFill } from './hyperliquid/user';

beforeAll(() => {
  (globalThis as { document?: { documentElement: { lang: string } } }).document = {
    documentElement: { lang: 'en' },
  };
});

describe('adminHlWalletPnlFromFills', () => {
  it('sums both ADA close fills minus fees — not a single fill', async () => {
    const { adminHlWalletPnlFromFills } = await import('./adminHlWalletPnl');
    const fills: HlUserFill[] = [
      {
        coin: 'ADA',
        px: '0.14584',
        sz: '949',
        side: 'B',
        time: 1_000,
        closedPnl: '-4.31795',
        fee: '0.06228',
        dir: 'Close Short',
        oid: 613130527674,
        tid: 1,
      },
      {
        coin: 'ADA',
        px: '0.14584',
        sz: '783',
        side: 'B',
        time: 1_000,
        closedPnl: '-3.56265',
        fee: '0.051386',
        dir: 'Close Short',
        oid: 613130527674,
        tid: 2,
      },
    ];
    const pnl = adminHlWalletPnlFromFills('0xb4ab7cae55a30fc5f1c70ed59ca045e0b2478207', fills);
    expect(pnl.closedCount).toBe(1);
    expect(pnl.lossCount).toBe(1);
    expect(pnl.closedNet).toBeCloseTo(-4.31795 - 3.56265 - 0.06228 - 0.051386, 5);
    expect(pnl.closedNet).toBeLessThan(-7.9);
  });

  it('wallet pnl is equity minus deposits', async () => {
    const { adminHlWalletPnlFromFills } = await import('./adminHlWalletPnl');
    const pnl = adminHlWalletPnlFromFills('0xb4ab7cae55a30fc5f1c70ed59ca045e0b2478207', [], {
      equityUsd: 46.31,
      netDepositsUsd: 50,
    });
    expect(pnl.walletPnlUsd).toBeCloseTo(-3.69, 2);
    expect(pnl.closedNet).toBe(0);
  });
});

describe('netHlLedgerUsdc', () => {
  it('counts deposit in and withdraw out', async () => {
    const { netHlLedgerUsdc } = await import('./adminHlWalletPnl');
    const w = '0xb4ab7cae55a30fc5f1c70ed59ca045e0b2478207';
    expect(
      netHlLedgerUsdc(
        [
          { time: 1, delta: { type: 'deposit', usdc: '50' } },
          { time: 2, delta: { type: 'withdraw', usdc: '10' } },
        ],
        w
      )
    ).toBe(40);
  });
});
