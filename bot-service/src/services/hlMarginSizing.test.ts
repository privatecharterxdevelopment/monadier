import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
  process.env.BOT_PRIVATE_KEY = process.env.BOT_PRIVATE_KEY ?? `0x${'11'.repeat(32)}`;
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? 'test-service-key';
  process.env.HL_BUILDER_ADDRESS =
    process.env.HL_BUILDER_ADDRESS ?? `0x${'22'.repeat(32)}`;
});

describe('hlEntrySizingBalanceUsd', () => {
  it('caps sizing to free margin when equity is inflated by uPnL', async () => {
    const { hlEntrySizingBalanceUsd } = await import('./hlInfo.js');
    const funding = {
      perpUsd: 500,
      spotUsdcUsd: 0,
      tradablePerpUsd: 500,
      accountEquityUsd: 500,
      unifiedAccount: false,
      withdrawableUsd: 45,
      stateLoaded: true,
    };
    const state = {
      marginSummary: { accountValue: '500', totalMarginUsed: '455' },
      withdrawable: '45',
      assetPositions: [],
    };
    const sizing = hlEntrySizingBalanceUsd(funding, state as never);
    assert.ok(sizing <= 45, `expected <=45 got ${sizing}`);
  });
});

describe('resolveHlMarginPerSlot', () => {
  it('sizes from available balance not equity when free margin is lower', async () => {
    const { resolveHlMarginPerSlot } = await import('./hlTrading.js');
    const equity = 500;
    const available = 40;
    const free = 38;
    const perSlot = resolveHlMarginPerSlot(available, 3000, 0, free, equity);
    assert.ok(perSlot <= free / 2 + 0.01);
    assert.ok(perSlot <= available * 0.22 + 0.01);
  });

  it('second slot uses remaining free margin only', async () => {
    const { resolveHlMarginPerSlot } = await import('./hlTrading.js');
    const available = 50;
    const free = 22;
    const perSlot = resolveHlMarginPerSlot(available, 3000, 1, free, 100);
    assert.ok(perSlot <= free + 0.01);
    assert.ok(perSlot <= 22);
  });
});

describe('capHlEntryCollateralToAvailable', () => {
  it('never allocates more than free margin for the slot', async () => {
    const { capHlEntryCollateralToAvailable } = await import('./hlTrading.js');
    assert.equal(capHlEntryCollateralToAvailable(15, 12, 1), 12);
    assert.equal(capHlEntryCollateralToAvailable(8, 12, 2), 6);
  });
});
