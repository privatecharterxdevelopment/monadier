import { supabase } from './supabase';

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

/** Find open DB position for vault wallet + token symbol (WETH / WBTC). */
export async function findOpenPositionId(
  walletAddress: string,
  tokenSymbol: 'WETH' | 'WBTC'
): Promise<string | null> {
  const { data } = await supabase
    .from('positions')
    .select('id')
    .eq('wallet_address', walletAddress.toLowerCase())
    .in('status', ['open', 'closing'])
    .eq('token_symbol', tokenSymbol)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
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
