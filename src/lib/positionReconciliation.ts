import type { PublicClient } from 'viem';
import { VAULT_ADDRESS, VAULT_CHAIN_ID, VaultClient } from './vault';
import { supabase } from './supabase';
import { fetchUserWalletAddresses } from './userWallets';

const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1';
const WBTC = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f';

const TRACKED_TOKENS = [
  { address: WETH, symbol: 'WETH' },
  { address: WBTC, symbol: 'WBTC' },
] as const;

function tokenAddressForRow(
  tokenAddress: string | null | undefined,
  tokenSymbol: string | null | undefined
): string {
  const addr = tokenAddress?.toLowerCase();
  if (addr?.startsWith('0x')) return addr;
  const sym = (tokenSymbol || 'WETH').toUpperCase();
  if (sym === 'WBTC' || sym === 'BTC' || sym === 'BTCB') return WBTC;
  return WETH;
}

async function isVaultPositionActive(
  publicClient: PublicClient,
  wallet: `0x${string}`,
  tokenAddress: string
): Promise<boolean> {
  const positionAbi = [
    {
      inputs: [
        { name: 'user', type: 'address' },
        { name: 'token', type: 'address' },
      ],
      name: 'positions',
      outputs: [
        { name: 'isActive', type: 'bool' },
        { name: 'isLong', type: 'bool' },
        { name: 'token', type: 'address' },
        { name: 'collateral', type: 'uint256' },
        { name: 'size', type: 'uint256' },
        { name: 'leverage', type: 'uint256' },
        { name: 'entryPrice', type: 'uint256' },
        { name: 'stopLoss', type: 'uint256' },
        { name: 'takeProfit', type: 'uint256' },
        { name: 'timestamp', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const;

  try {
    const result = (await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: positionAbi,
      functionName: 'positions',
      args: [wallet, tokenAddress as `0x${string}`],
    })) as readonly [boolean, ...unknown[]];
    return Boolean(result[0]);
  } catch {
    return false;
  }
}

async function fetchLivePrice(symbol: string): Promise<number> {
  const pair = symbol.toUpperCase().includes('BTC') ? 'BTCUSDT' : 'ETHUSDT';
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`
    );
    const json = await res.json();
    return parseFloat(json.price) || 0;
  } catch {
    return 0;
  }
}

/** Close DB rows that are open/closing but vault has no active position for that token. */
export async function reconcileWalletPositions(
  walletAddress: string,
  publicClient: PublicClient
): Promise<number> {
  const wallet = walletAddress.toLowerCase() as `0x${string}`;

  const activeByToken = new Map<string, boolean>();
  for (const t of TRACKED_TOKENS) {
    activeByToken.set(
      t.address,
      await isVaultPositionActive(publicClient, wallet, t.address)
    );
  }

  const { data: rows, error } = await supabase
    .from('positions')
    .select('id, token_address, token_symbol, status, entry_price')
    .eq('wallet_address', wallet)
    .eq('chain_id', VAULT_CHAIN_ID)
    .in('status', ['open', 'closing']);

  if (error) {
    console.error('[reconcile]', error);
    return 0;
  }
  if (!rows?.length) return 0;

  const syncedTokens = new Set<string>();
  let synced = 0;

  for (const row of rows) {
    const tokenAddr = tokenAddressForRow(row.token_address, row.token_symbol);
    if (activeByToken.get(tokenAddr) || syncedTokens.has(tokenAddr)) continue;

    const exitPrice =
      (await fetchLivePrice(row.token_symbol || 'WETH')) ||
      row.entry_price ||
      0;

    const { data, error } = await supabase.rpc('reconcile_stale_positions_for_wallet', {
      p_wallet_address: wallet,
      p_token_address: tokenAddr,
      p_exit_price: exitPrice > 0 ? exitPrice : null,
    });

    if (error) {
      console.error('[reconcile] rpc', error);
      continue;
    }

    syncedTokens.add(tokenAddr);
    synced += typeof data === 'number' ? data : 0;
  }

  return synced;
}

/** Reconcile all wallets linked to the connected user (throttled caller). */
export async function reconcileUserPositions(
  connectedAddress: string | undefined,
  publicClient: PublicClient | null | undefined,
  isDemoUser: boolean
): Promise<number> {
  if (!publicClient || isDemoUser || !connectedAddress) return 0;

  const wallets = await fetchUserWalletAddresses(connectedAddress, false);
  let total = 0;
  for (const w of wallets) {
    total += await reconcileWalletPositions(w, publicClient);
  }
  return total;
}

/** Vault active on-chain but no open DB row — user-signed reconcile tx only (never auto-run). */
export async function tryReconcileOrphanedVaultOnChain(
  wallet: `0x${string}`,
  publicClient: PublicClient,
  walletClient: import('viem').WalletClient
): Promise<boolean> {
  const client = new VaultClient(
    publicClient,
    walletClient as never,
    VAULT_CHAIN_ID
  );

  for (const t of TRACKED_TOKENS) {
    const onChain = await client.getPosition(wallet, t.address as `0x${string}`);
    if (!onChain.isActive) continue;

    const { data: openRows } = await supabase
      .from('positions')
      .select('id')
      .eq('wallet_address', wallet.toLowerCase())
      .eq('chain_id', VAULT_CHAIN_ID)
      .in('status', ['open', 'closing'])
      .limit(1);

    if (openRows?.length) continue;

    try {
      const hash = await client.reconcilePosition(
        t.address as `0x${string}`,
        wallet
      );
      await publicClient.waitForTransactionReceipt({ hash });
      return true;
    } catch (e) {
      console.warn('[reconcile] orphan on-chain', e);
    }
  }
  return false;
}
