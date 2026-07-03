import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
  process.env.BOT_PRIVATE_KEY = process.env.BOT_PRIVATE_KEY ?? `0x${'11'.repeat(32)}`;
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? 'test-service-key';
  process.env.HL_BUILDER_ADDRESS =
    process.env.HL_BUILDER_ADDRESS ?? `0x${'22'.repeat(32)}`;
});

import { __test } from './publicLeaderboard.js';

const { aggregateHlCloseFills, mergeLeaderboardRows, maskWalletLabel } = __test;

describe('publicLeaderboard', () => {
  it('masks wallet labels like the RPC', () => {
    assert.equal(maskWalletLabel('0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c'), 'f735…469c');
  });

  it('aggregates profitable HL close fills by hash', () => {
    const now = Date.now();
    const rows = aggregateHlCloseFills([
      {
        coin: 'TRX',
        px: '0.1',
        sz: '100',
        side: 'A',
        time: now - 60_000,
        closedPnl: '0.40',
        fee: '0',
        dir: 'Close Long',
        hash: '0xabc123',
      },
      {
        coin: 'TRX',
        px: '0.1',
        sz: '50',
        side: 'A',
        time: now - 60_000,
        closedPnl: '0.25',
        fee: '0',
        dir: 'Close Long',
        hash: '0xabc123',
      },
      {
        coin: 'YGG',
        px: '0.02',
        sz: '100',
        side: 'B',
        time: now - 30_000,
        closedPnl: '-1.2',
        fee: '0',
        dir: 'Close Short',
        hash: '0xloss',
      },
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].coin, 'TRX');
    assert.ok(Math.abs(rows[0].profitUsd - 0.65) < 0.0001);
  });

  it('prefers HL rows when merging duplicates', () => {
    const closedAt = new Date().toISOString();
    const merged = mergeLeaderboardRows(
      [
        {
          id: 'db-1',
          wallet_address: '0xabc',
          wallet_label: 'abc',
          token_symbol: 'TRX',
          direction: 'LONG',
          profit_usd: 0.65,
          opened_at: null,
          closed_at: closedAt,
          exit_tx_hash: '0xabc123',
          source: 'db',
        },
      ],
      [
        {
          id: 'hl-1',
          wallet_address: '0xabc',
          wallet_label: 'abc',
          token_symbol: 'TRX',
          direction: 'LONG',
          profit_usd: 0.65,
          opened_at: null,
          closed_at: closedAt,
          exit_tx_hash: '0xabc123',
          source: 'hyperliquid',
        },
      ]
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0].source, 'hyperliquid');
  });
});
