/**
 * Bot-side vault chain history sync (service role) — same pairing logic as frontend.
 */
import { createPublicClient, decodeEventLog, http } from 'viem';
import { arbitrum } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const VAULT_ADDRESS = (process.env.ARBITRUM_VAULT_ADDRESS ||
  '0x7dE97f35887b2623dCad2ebA68197f58F7607854') as `0x${string}`;

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

const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1';
const WBTC = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f';

function tokenSymbol(addr: string): string {
  return addr.toLowerCase() === WBTC ? 'WBTC' : 'WETH';
}

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

const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
});

async function fetchEvents(wallet: string, lookbackHours = 48): Promise<Array<ParsedOpen | ParsedClose>> {
  const walletTopic = (`0x${wallet.slice(2).toLowerCase().padStart(64, '0')}`) as `0x${string}`;
  const latest = await publicClient.getBlockNumber();
  const from = latest - BigInt(Math.ceil(lookbackHours * 3600 * 4));

  const logs = await publicClient.getLogs({
    address: VAULT_ADDRESS,
    fromBlock: from > 0n ? from : 0n,
    toBlock: latest,
  });

  const userLogs = logs.filter((l) => l.topics.some((t) => t?.toLowerCase() === walletTopic));
  const events: Array<ParsedOpen | ParsedClose> = [];

  for (const log of userLogs) {
    try {
      const decoded = decodeEventLog({ abi: VAULT_EVENT_ABI, data: log.data, topics: log.topics });
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
      /* skip */
    }
  }

  events.sort((a, b) => a.ts - b.ts);
  return events;
}

async function importPair(wallet: string, open: ParsedOpen, close: ParsedClose): Promise<boolean> {
  const { data: existing } = await supabase
    .from('positions')
    .select('id')
    .eq('exit_tx_hash', close.tx.toLowerCase())
    .maybeSingle();

  if (existing?.id) return false;

  const entry = open.collateral;
  const pnl = close.pnl;
  const pnlPct = entry > 0 ? (pnl / entry) * 100 : 0;

  const { data: row, error } = await supabase
    .from('positions')
    .insert({
      wallet_address: wallet.toLowerCase(),
      chain_id: 42161,
      token_address: open.token,
      token_symbol: tokenSymbol(open.token),
      direction: open.isLong ? 'LONG' : 'SHORT',
      entry_price: 0,
      entry_amount: entry,
      token_amount: entry,
      highest_price: 0,
      trailing_stop_percent: 1,
      leverage_multiplier: open.leverage,
      status: 'closed',
      close_reason: close.reason || 'chain_sync',
      entry_tx_hash: open.tx || null,
      exit_tx_hash: close.tx.toLowerCase(),
      profit_loss: pnl,
      profit_loss_percent: pnlPct,
      created_at: new Date(open.ts * 1000).toISOString(),
      closed_at: new Date(close.ts * 1000).toISOString(),
      updated_at: new Date(close.ts * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return false;
    logger.error('[chainHistorySync] insert position', { error, wallet: wallet.slice(0, 10) });
    return false;
  }

  await supabase.from('trade_history').insert({
    position_id: row.id,
    wallet_address: wallet.toLowerCase(),
    chain_id: 42161,
    token_symbol: tokenSymbol(open.token),
    direction: open.isLong ? 'LONG' : 'SHORT',
    leverage: open.leverage,
    entry_price: 0,
    entry_amount: entry,
    exit_tx_hash: close.tx.toLowerCase(),
    profit_loss: pnl,
    profit_loss_percent: pnlPct,
    close_reason: close.reason || 'chain_sync',
    opened_at: new Date(open.ts * 1000).toISOString(),
    closed_at: new Date(close.ts * 1000).toISOString(),
    entry_tx_hash: open.tx || null,
  });

  return true;
}

export async function syncVaultChainHistoryForWallet(
  walletAddress: string,
  lookbackHours = 48
): Promise<number> {
  const wallet = walletAddress.toLowerCase();
  const events = await fetchEvents(wallet, lookbackHours);
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
    const open = stack?.pop() ?? {
      kind: 'open' as const,
      tx: '',
      token: ev.token,
      isLong: true,
      collateral: 0,
      leverage: 1,
      ts: ev.ts,
    };
    pairs.push({ open, close: ev });
  }

  let imported = 0;
  for (const pair of pairs) {
    if (await importPair(wallet, pair.open, pair.close)) imported++;
  }

  if (imported > 0) {
    logger.info('[chainHistorySync] imported closed trades', {
      wallet: wallet.slice(0, 10),
      imported,
    });
  }

  return imported;
}

export async function syncAutoTradeWalletsChainHistory(): Promise<number> {
  const { data, error } = await supabase
    .from('vault_settings')
    .select('wallet_address')
    .eq('chain_id', 42161)
    .eq('auto_trade_enabled', true);

  if (error || !data?.length) return 0;

  let total = 0;
  for (const row of data) {
    if (!row.wallet_address) continue;
    total += await syncVaultChainHistoryForWallet(row.wallet_address, 72);
  }
  return total;
}
