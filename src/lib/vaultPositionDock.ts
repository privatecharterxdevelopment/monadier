import { VaultClient, VAULT_CHAIN_ID, getArbitrumPublicClient } from './vault';
import { markPositionClosing } from './positionClose';
import type { ActiveVaultPosition } from '../hooks/useTerminalVaultData';

const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const;
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const;

const VAULT_TOKENS = [
  { token: 'ETH' as const, address: WETH, symbols: ['ETH', 'WETH'] },
  { token: 'BTC' as const, address: WBTC, symbols: ['BTC', 'WBTC'] },
];

export const ONCHAIN_POSITION_PREFIX = 'onchain:';

export type VaultDockPosition = {
  id: string;
  wallet_address: string;
  chain_id: number;
  token_symbol: string;
  token_address: string;
  direction: string;
  entry_price: number;
  entry_amount: number;
  profit_loss: number | null;
  status: string;
  leverage_multiplier: number | null;
  highest_price: number | null;
  created_at: string;
  closed_at: string | null;
  close_reason: string | null;
  exit_tx_hash: string | null;
  entry_tx_hash: string | null;
};

function tokenSymbolsForVault(pos: ActiveVaultPosition): string[] {
  return pos.token === 'BTC' ? ['WBTC', 'BTC'] : ['WETH', 'ETH'];
}

export function isOnChainDockPositionId(id: string): boolean {
  return id.startsWith(ONCHAIN_POSITION_PREFIX);
}

export function vaultPositionToDockRow(
  wallet: string,
  pos: ActiveVaultPosition
): VaultDockPosition {
  const tokenSymbol = pos.token === 'BTC' ? 'WBTC' : 'ETH';
  const tokenAddress = pos.token === 'BTC' ? WBTC : WETH;
  const collateral = parseFloat(pos.collateral) || 0;
  const entryPrice = parseFloat(pos.entryPrice) || 0;

  return {
    id: `${ONCHAIN_POSITION_PREFIX}${wallet.toLowerCase()}:${tokenSymbol}`,
    wallet_address: wallet.toLowerCase(),
    chain_id: VAULT_CHAIN_ID,
    token_symbol: tokenSymbol,
    token_address: tokenAddress,
    direction: pos.isLong ? 'LONG' : 'SHORT',
    entry_price: entryPrice,
    entry_amount: collateral,
    profit_loss: pos.pnl ?? null,
    status: 'open',
    leverage_multiplier: pos.leverage,
    highest_price: pos.currentPrice ?? entryPrice,
    created_at: new Date().toISOString(),
    closed_at: null,
    close_reason: null,
    exit_tx_hash: null,
    entry_tx_hash: null,
  };
}

export function rowMatchesVaultPosition(
  row: { wallet_address: string; token_symbol: string; status: string },
  wallet: string,
  pos: ActiveVaultPosition
): boolean {
  if (row.status !== 'open' && row.status !== 'closing') return false;
  const walletMatch = row.wallet_address.toLowerCase() === wallet.toLowerCase();
  if (!walletMatch) return false;
  const symbols = tokenSymbolsForVault(pos);
  return symbols.includes(row.token_symbol);
}

export function mergeVaultPositionsIntoRows<T extends VaultDockPosition>(
  rows: T[],
  wallet: string | undefined,
  vaultPos: ActiveVaultPosition | null | undefined
): T[] {
  if (!wallet || !vaultPos?.isActive) return rows;
  if (rows.some((r) => rowMatchesVaultPosition(r, wallet, vaultPos))) return rows;
  return [vaultPositionToDockRow(wallet, vaultPos) as T, ...rows];
}

/** Read live vault positions from Arbitrum RPC (works when wallet is disconnected). */
export async function fetchVaultOpenPositionsForWallet(
  wallet: string
): Promise<VaultDockPosition[]> {
  const arbClient = getArbitrumPublicClient();
  const client = new VaultClient(arbClient as never, arbClient as never, VAULT_CHAIN_ID);
  const user = wallet.toLowerCase() as `0x${string}`;

  const results = await Promise.all(
    VAULT_TOKENS.map(async ({ token, address }) => {
      try {
        const pos = await client.getPosition(user, address);
        if (!pos.isActive) return null;
        return vaultPositionToDockRow(wallet, {
          isActive: true,
          isLong: pos.isLong,
          collateral: pos.collateralFormatted,
          leverage: pos.leverage,
          entryPrice: parseFloat(pos.entryPriceFormatted).toFixed(2),
          token,
        });
      } catch (e) {
        console.warn('[fetchVaultOpenPositionsForWallet]', wallet, token, e);
        return null;
      }
    })
  );

  return results.filter((row): row is VaultDockPosition => row != null);
}

export async function fetchVaultOpenPositionsForWallets(
  wallets: string[]
): Promise<VaultDockPosition[]> {
  const seen = new Set<string>();
  const unique = wallets
    .map((w) => w.toLowerCase())
    .filter((w) => {
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    });
  const batches = await Promise.all(unique.map((w) => fetchVaultOpenPositionsForWallet(w)));
  return batches.flat();
}

function normalizeToken(sym: string): string {
  const u = sym.toUpperCase();
  if (u === 'WETH' || u === 'ETH') return 'ETH';
  if (u === 'WBTC' || u === 'BTC') return 'BTC';
  return u;
}

/** Merge Supabase rows with on-chain vault positions (on-chain wins when DB is missing). */
export function mergeChainAndDbRows<T extends VaultDockPosition>(
  dbRows: T[],
  chainRows: VaultDockPosition[]
): T[] {
  const merged = new Map<string, T>();
  for (const row of dbRows) {
    merged.set(row.id, row);
  }

  for (const chainRow of chainRows) {
    const chainNorm = normalizeToken(chainRow.token_symbol);
    const duplicate = [...merged.values()].some(
      (r) =>
        r.wallet_address.toLowerCase() === chainRow.wallet_address.toLowerCase() &&
        (r.status === 'open' || r.status === 'closing') &&
        normalizeToken(r.token_symbol) === chainNorm
    );
    if (!duplicate) {
      merged.set(chainRow.id, chainRow as T);
    }
  }

  return [...merged.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function vaultTokenFromDockRow(row: {
  id: string;
  token_symbol: string;
}): 'ETH' | 'BTC' {
  if (row.token_symbol === 'WBTC' || row.token_symbol === 'BTC') return 'BTC';
  if (isOnChainDockPositionId(row.id)) {
    const part = row.id.split(':')[2];
    if (part === 'WBTC') return 'BTC';
  }
  return 'ETH';
}
