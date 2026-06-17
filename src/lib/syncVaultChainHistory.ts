import type { PublicClient } from 'viem';
import { decodeEventLog } from 'viem';
import { VAULT_ADDRESS, VAULT_CHAIN_ID } from './vault';
import { supabase } from './supabase';

const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const;
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const;

const VAULT_EVENT_ABI = [
  {
    type: 'event',
    name: 'PositionOpened',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'isLong', type: 'bool', indexed: false },
      { name: 'collateral', type: 'uint256', indexed: false },
      { name: 'leverage', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PositionClosed',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'pnl', type: 'int256', indexed: false },
      { name: 'reason', type: 'string', indexed: false },
    ],
  },
] as const;

type ParsedOpen = {
  kind: 'open';
  tx: string;
  token: string;
  isLong: boolean;
  collateral: number;
  leverage: number;
  ts: number;
};

type ParsedClose = {
  kind: 'close';
  tx: string;
  token: string;
  pnl: number;
  reason: string;
  ts: number;
};

function tokenSymbol(addr: string): string {
  const a = addr.toLowerCase();
  if (a === WBTC.toLowerCase()) return 'WBTC';
  return 'WETH';
}

function blocksForHours(hours: number): bigint {
  return BigInt(Math.ceil(hours * 3600 * 4));
}

async function fetchVaultEvents(
  publicClient: PublicClient,
  wallet: string,
  lookbackHours = 24
): Promise<Array<ParsedOpen | ParsedClose>> {
  const walletTopic = (`0x${wallet.slice(2).toLowerCase().padStart(64, '0')}`) as `0x${string}`;
  const latest = await publicClient.getBlockNumber();
  const from = latest > blocksForHours(lookbackHours) ? latest - blocksForHours(lookbackHours) : 0n;

  const logs = await publicClient.getLogs({
    address: VAULT_ADDRESS,
    fromBlock: from,
    toBlock: latest,
  });

  const userLogs = logs.filter((l) =>
    l.topics.some((t) => t?.toLowerCase() === walletTopic)
  );

  const events: Array<ParsedOpen | ParsedClose> = [];

  for (const log of userLogs) {
    try {
      const decoded = decodeEventLog({
        abi: VAULT_EVENT_ABI,
        data: log.data,
        topics: log.topics,
      });
      const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
      const ts = Number(block.timestamp);

      if (decoded.eventName === 'PositionOpened') {
        const args = decoded.args as {
          token: string;
          isLong: boolean;
          collateral: bigint;
          leverage: bigint;
        };
        events.push({
          kind: 'open',
          tx: log.transactionHash,
          token: args.token.toLowerCase(),
          isLong: args.isLong,
          collateral: Number(args.collateral) / 1e6,
          leverage: Number(args.leverage),
          ts,
        });
      } else if (decoded.eventName === 'PositionClosed') {
        const args = decoded.args as { token: string; pnl: bigint; reason: string };
        events.push({
          kind: 'close',
          tx: log.transactionHash,
          token: args.token.toLowerCase(),
          pnl: Number(args.pnl) / 1e6,
          reason: args.reason,
          ts,
        });
      }
    } catch {
      /* other vault events */
    }
  }

  events.sort((a, b) => a.ts - b.ts);
  return events;
}

export type ChainSyncResult = { imported: number; skipped: number; errors: number };

/**
 * Import missing on-chain vault closes into Supabase (idempotent on exit_tx_hash).
 * Fixes trade history when bot/UI closed on-chain without a DB row.
 */
export async function syncVaultChainHistoryForWallet(
  walletAddress: string,
  publicClient: PublicClient | null | undefined,
  lookbackHours = 24
): Promise<ChainSyncResult> {
  const wallet = walletAddress.toLowerCase();
  if (!publicClient || !wallet.startsWith('0x')) {
    return { imported: 0, skipped: 0, errors: 0 };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { imported: 0, skipped: 0, errors: 0 };
  }

  let events: Array<ParsedOpen | ParsedClose>;
  try {
    events = await fetchVaultEvents(publicClient, wallet, lookbackHours);
  } catch (e) {
    console.error('[syncVaultChainHistory] fetch events', e);
    return { imported: 0, skipped: 0, errors: 1 };
  }

  const openStack = new Map<string, ParsedOpen[]>();
  const pairs: Array<{ open: ParsedOpen; close: ParsedClose }> = [];

  for (const ev of events) {
    if (ev.kind === 'open') {
      const stack = openStack.get(ev.token) ?? [];
      stack.push(ev);
      openStack.set(ev.token, stack);
      continue;
    }
    const stack = openStack.get(ev.token);
    const open = stack?.pop();
    if (open) {
      pairs.push({ open, close: ev });
    } else {
      pairs.push({
        open: {
          kind: 'open',
          tx: '',
          token: ev.token,
          isLong: true,
          collateral: 0,
          leverage: 1,
          ts: ev.ts,
        },
        close: ev,
      });
    }
  }

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const { open, close } of pairs) {
    const { data: existing } = await supabase
      .from('positions')
      .select('id')
      .eq('exit_tx_hash', close.tx.toLowerCase())
      .maybeSingle();

    if (existing?.id) {
      skipped++;
      continue;
    }

    const { error } = await supabase.rpc('upsert_chain_closed_trade', {
      p_wallet: wallet,
      p_token_address: open.token,
      p_token_symbol: tokenSymbol(open.token),
      p_direction: open.isLong ? 'LONG' : 'SHORT',
      p_entry_tx_hash: open.tx || null,
      p_exit_tx_hash: close.tx,
      p_entry_amount: open.collateral,
      p_leverage: open.leverage,
      p_profit_loss: close.pnl,
      p_close_reason: close.reason || 'chain_sync',
      p_opened_at: new Date(open.ts * 1000).toISOString(),
      p_closed_at: new Date(close.ts * 1000).toISOString(),
    });

    if (error) {
      if (error.message.includes('Could not find the function')) {
        return { imported, skipped, errors: errors + 1 };
      }
      if (!error.message.includes('duplicate')) {
        console.error('[syncVaultChainHistory] upsert', error.message);
        errors++;
      } else {
        skipped++;
      }
      continue;
    }
    imported++;
  }

  if (imported > 0) {
    console.info(`[syncVaultChainHistory] imported ${imported} closed trade(s) for ${wallet.slice(0, 10)}…`);
  }

  return { imported, skipped, errors };
}

export async function syncVaultChainHistoryForWallets(
  wallets: string[],
  publicClient: PublicClient | null | undefined
): Promise<ChainSyncResult> {
  const totals: ChainSyncResult = { imported: 0, skipped: 0, errors: 0 };
  const unique = [...new Set(wallets.map((w) => w.toLowerCase()))];
  for (const w of unique) {
    const r = await syncVaultChainHistoryForWallet(w, publicClient, 48);
    totals.imported += r.imported;
    totals.skipped += r.skipped;
    totals.errors += r.errors;
  }
  return totals;
}
