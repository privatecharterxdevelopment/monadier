import { findOpenPositionId, markPositionClosing } from './positionClose';
import { VaultClient, VAULT_CHAIN_ID } from './vault';

const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const;
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const;

export type VaultCloseMethod = 'bot' | 'bot_retry' | 'on_chain';

export type VaultCloseResult = {
  method: VaultCloseMethod;
  positionId?: string;
  txHash?: `0x${string}`;
};

function tokenSymbolForLookup(token: 'ETH' | 'BTC'): string {
  return token === 'ETH' ? 'WETH' : 'WBTC';
}

/** Prefer bot close (no wallet). Fall back to on-chain user tx when no DB row. */
export async function executeVaultPositionClose(params: {
  wallet: string;
  token: 'ETH' | 'BTC';
  publicClient: unknown | null | undefined;
  walletClient: unknown | null | undefined;
  positionId?: string;
}): Promise<VaultCloseResult> {
  const sym = tokenSymbolForLookup(params.token);
  const wallet = params.wallet.toLowerCase();

  const openId = await findOpenPositionId(wallet, sym, ['open']);
  if (openId) {
    await markPositionClosing(openId);
    return { method: 'bot', positionId: openId };
  }

  const closingId = await findOpenPositionId(wallet, sym, ['closing']);
  if (closingId) {
    await markPositionClosing(closingId, 'retry_close');
    return { method: 'bot_retry', positionId: closingId };
  }

  if (!params.publicClient || !params.walletClient) {
    throw new Error(
      'Connect wallet to close on-chain, or sign in so the bot can close vault trades.'
    );
  }

  const client = new VaultClient(
    params.publicClient as never,
    params.walletClient as never,
    VAULT_CHAIN_ID
  );
  const tokenAddr = params.token === 'ETH' ? WETH : WBTC;
  let txHash: `0x${string}` | undefined;
  try {
    txHash = await client.userInstantClose(tokenAddr, wallet as `0x${string}`);
    await (
      params.publicClient as {
        waitForTransactionReceipt: (a: { hash: `0x${string}` }) => Promise<unknown>;
      }
    ).waitForTransactionReceipt({ hash: txHash });
  } catch {
    txHash = await client.reconcilePosition(tokenAddr, wallet as `0x${string}`);
    await (
      params.publicClient as {
        waitForTransactionReceipt: (a: { hash: `0x${string}` }) => Promise<unknown>;
      }
    ).waitForTransactionReceipt({ hash: txHash });
  }

  return { method: 'on_chain', positionId: params.positionId, txHash };
}

export function closeMethodMessage(result: VaultCloseResult): string {
  if (result.method === 'bot') {
    return 'Bot is closing your position — usually within ~30s. Check Trade history.';
  }
  if (result.method === 'bot_retry') {
    return 'Close re-queued for the bot. If it stays open, connect wallet and try again.';
  }
  return 'Position closed on-chain. Vault balance updates after settlement.';
}
