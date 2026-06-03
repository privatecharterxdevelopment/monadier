import type { PublicClient, WalletClient } from 'viem';
import { VaultClient, VAULT_CHAIN_ID } from './vault';
import { supabase } from './supabase';
import { clampLeverage } from './leverageLimits';

export type VaultSettingsWrite = {
  walletAddress: string;
  autoTradeEnabled: boolean;
  riskPct: number;
  leverage: number;
  takeProfit: number;
  stopLoss: number;
  askPermission?: boolean;
  minWinRate?: number;
  minTradesForWinRate?: number;
};

export type PersistVaultSettingsOptions = {
  settings: VaultSettingsWrite;
  planTier: string;
  publicClient?: PublicClient | null;
  walletClient?: WalletClient | null;
  userAddress?: `0x${string}`;
  isDemoUser?: boolean;
  syncTradingParams?: boolean;
  syncAutoTrade?: boolean;
};

/** Persist vault settings to Arbitrum contract (when requested) and Supabase. */
export async function persistVaultSettings(
  opts: PersistVaultSettingsOptions
): Promise<void> {
  const wallet = opts.settings.walletAddress.toLowerCase();
  const leverage = clampLeverage(opts.settings.leverage, opts.planTier);

  const canChain =
    !opts.isDemoUser &&
    opts.publicClient &&
    opts.walletClient &&
    opts.userAddress;

  if (canChain) {
    const client = new VaultClient(
      opts.publicClient as PublicClient,
      opts.walletClient as WalletClient,
      VAULT_CHAIN_ID
    );

    if (opts.syncTradingParams) {
      const hash = await client.setTradingSettings(
        opts.userAddress!,
        false,
        opts.settings.riskPct,
        leverage,
        opts.settings.stopLoss,
        opts.settings.takeProfit
      );
      await opts.publicClient!.waitForTransactionReceipt({ hash });
    }

    if (opts.syncAutoTrade) {
      const hash = await client.setAutoTrade(
        opts.settings.autoTradeEnabled,
        opts.userAddress!
      );
      await opts.publicClient!.waitForTransactionReceipt({ hash });
    }
  }

  const payload = {
    wallet_address: wallet,
    chain_id: VAULT_CHAIN_ID,
    auto_trade_enabled: opts.settings.autoTradeEnabled,
    risk_level_bps: Math.round(opts.settings.riskPct * 100),
    take_profit_percent: opts.settings.takeProfit,
    stop_loss_percent: opts.settings.stopLoss,
    leverage_multiplier: leverage,
    ask_permission: opts.settings.askPermission ?? false,
    min_win_rate_percent: opts.settings.minWinRate ?? 0,
    min_trades_for_win_rate_gate: opts.settings.minTradesForWinRate ?? 5,
    updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from('vault_settings')
    .select('id')
    .eq('wallet_address', wallet)
    .eq('chain_id', VAULT_CHAIN_ID)
    .maybeSingle();

  const err = existing
    ? (
        await supabase
          .from('vault_settings')
          .update(payload)
          .eq('wallet_address', wallet)
          .eq('chain_id', VAULT_CHAIN_ID)
      ).error
    : (await supabase.from('vault_settings').insert(payload)).error;

  if (err) throw new Error(err.message);
}
