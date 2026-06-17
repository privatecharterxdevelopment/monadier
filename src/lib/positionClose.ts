import { supabase } from './supabase';

const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1';
const WBTC = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f';

export async function markPositionClosing(
  positionId: string,
  closeReason: 'user_requested' | 'retry_close' = 'user_requested'
): Promise<void> {
  const { error } = await supabase
    .from('positions')
    .update({ status: 'closing', close_reason: closeReason })
    .eq('id', positionId);

  if (error) throw error;
}

export async function markPositionCloseFailed(
  positionId: string,
  message: string
): Promise<void> {
  await supabase
    .from('positions')
    .update({
      status: 'failed',
      close_reason: `User close failed: ${message.slice(0, 100)}`,
    })
    .eq('id', positionId);
}

const TOKEN_ALIASES: Record<string, string[]> = {
  WETH: ['WETH', 'ETH'],
  ETH: ['WETH', 'ETH'],
  WBTC: ['WBTC', 'BTC'],
  BTC: ['WBTC', 'BTC'],
};

function tokenSymbolsForLookup(tokenSymbol: string): string[] {
  const key = tokenSymbol.toUpperCase();
  return TOKEN_ALIASES[key] ?? [key];
}

/** Find open DB position for vault wallet + token (ETH/WETH or BTC/WBTC). */
export async function findOpenPositionId(
  walletAddress: string,
  tokenSymbol: string,
  statuses: Array<'open' | 'closing' | 'failed'> = ['open']
): Promise<string | null> {
  const symbols = tokenSymbolsForLookup(tokenSymbol);
  const { data } = await supabase
    .from('positions')
    .select('id')
    .eq('wallet_address', walletAddress.toLowerCase())
    .in('status', statuses)
    .in('token_symbol', symbols)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

/** Ask the bot to close via Supabase — no wallet popup. Returns false if no open DB row. */
export async function requestBotCloseForVault(
  walletAddress: string,
  token: 'ETH' | 'BTC'
): Promise<boolean> {
  const tokenSymbol = token === 'ETH' ? 'WETH' : 'WBTC';
  const dbId = await findOpenPositionId(walletAddress, tokenSymbol, ['open']);
  if (!dbId) return false;
  await markPositionClosing(dbId);
  return true;
}

/** Mark every open position for a wallet so the bot closes them (e.g. on stop bot). */
export async function markAllOpenPositionsClosing(
  walletAddress: string,
  closeReason: 'bot_stopped' | 'user_requested' = 'bot_stopped'
): Promise<number> {
  const { data, error } = await supabase
    .from('positions')
    .update({ status: 'closing', close_reason: closeReason })
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('status', 'open')
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

function tokenAddressForSymbol(tokenSymbol: string): string {
  const sym = tokenSymbol.toUpperCase();
  if (sym === 'WBTC' || sym === 'BTC') return WBTC;
  return WETH;
}

/** Persist a manual / on-chain vault close so trade history can show it. */
export async function recordManualVaultClose(params: {
  wallet: string;
  tokenSymbol: string;
  direction?: string;
  entryPrice?: number;
  entryAmount?: number;
  leverage?: number;
  profitLoss?: number | null;
  exitTxHash?: string;
  positionId?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('record_manual_vault_close', {
    p_wallet: params.wallet.toLowerCase(),
    p_token_address: tokenAddressForSymbol(params.tokenSymbol),
    p_token_symbol: params.tokenSymbol.toUpperCase().includes('BTC') ? 'WBTC' : 'WETH',
    p_direction: params.direction ?? 'LONG',
    p_entry_price: params.entryPrice ?? 0,
    p_entry_amount: params.entryAmount ?? 0,
    p_leverage: params.leverage ?? 1,
    p_exit_tx_hash: params.exitTxHash ?? null,
    p_profit_loss: params.profitLoss ?? null,
    p_position_id: params.positionId ?? null,
  });

  if (error && !error.message.includes('Could not find the function')) {
    console.error('[recordManualVaultClose]', error.message);
  }
}
