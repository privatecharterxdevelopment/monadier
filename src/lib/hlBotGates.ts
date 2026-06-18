import { supabase } from './supabase';
import { MIN_HL_BOT_USD } from './hyperliquid/hlBotAgent';

const HL_BOT_CHAIN_ID = 42161;

/** User has funded HL, approved agent, and platform builder fee — required before bot runs. */
export function isHlBotReadyToRun(
  hlBalanceUsd: number,
  agentApproved: boolean,
  builderFeeApproved = true
): boolean {
  return hlBalanceUsd >= MIN_HL_BOT_USD && agentApproved && builderFeeApproved;
}

/** DB flag alone is not enough — bot is only "running" when HL setup is complete. */
export function effectiveHlBotRunning(
  autoTradeEnabled: boolean,
  hlBalanceUsd: number,
  agentApproved: boolean,
  builderFeeApproved = true
): boolean {
  return autoTradeEnabled && isHlBotReadyToRun(hlBalanceUsd, agentApproved, builderFeeApproved);
}

/** Only disable when HL + agent checks succeeded and prerequisites are clearly missing. */
export function shouldDisableStaleHlBotAutoTrade(
  hlBalanceUsd: number,
  agentApproved: boolean,
  opts: { hlLoaded: boolean; agentLoaded: boolean; builderFeeApproved?: boolean }
): boolean {
  if (!opts.hlLoaded || !opts.agentLoaded) return false;
  return !isHlBotReadyToRun(
    hlBalanceUsd,
    agentApproved,
    opts.builderFeeApproved ?? true
  );
}

/** Turn off stale auto_trade when prerequisites are missing (legacy bad state). */
export async function disableStaleHlBotAutoTrade(walletAddress: string): Promise<void> {
  const wallet = walletAddress.toLowerCase();
  const { error } = await supabase.from('vault_settings').upsert(
    {
      wallet_address: wallet,
      chain_id: HL_BOT_CHAIN_ID,
      auto_trade_enabled: false,
      execution_venue: 'hyperliquid',
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address,chain_id' }
  );
  if (error) throw new Error(error.message);
}
