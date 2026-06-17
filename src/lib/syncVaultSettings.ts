import type { PublicClient, WalletClient } from 'viem';
import { VaultClient, VAULT_CHAIN_ID } from './vault';
import { supabase } from './supabase';
import { clampLeverage } from './leverageLimits';
import { getAuthUserId } from './userWallets';

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

export type PersistVaultSettingsResult = {
  savedToDatabase: boolean;
  syncedOnChain: boolean;
  chainWarning?: string;
};

/** Persist vault settings to Supabase first, then optional Arbitrum contract sync. */
export async function persistVaultSettings(
  opts: PersistVaultSettingsOptions
): Promise<PersistVaultSettingsResult> {
  const wallet = opts.settings.walletAddress.toLowerCase();
  const leverage = clampLeverage(opts.settings.leverage, opts.planTier);
  const userId = await getAuthUserId();

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
    ...(userId ? { user_id: userId } : {}),
  };

  const { error: dbError } = await supabase
    .from('vault_settings')
    .upsert(payload, { onConflict: 'wallet_address,chain_id' });

  if (dbError) {
    throw new Error(`Could not save settings: ${dbError.message}`);
  }

  const canChain =
    !opts.isDemoUser &&
    opts.publicClient &&
    opts.walletClient &&
    opts.userAddress;

  if (!canChain || (!opts.syncTradingParams && !opts.syncAutoTrade)) {
    return { savedToDatabase: true, syncedOnChain: false };
  }

  try {
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

    await supabase
      .from('vault_settings')
      .update({ synced_at: new Date().toISOString() })
      .eq('wallet_address', wallet)
      .eq('chain_id', VAULT_CHAIN_ID);

    return { savedToDatabase: true, syncedOnChain: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'On-chain sync failed';
    return {
      savedToDatabase: true,
      syncedOnChain: false,
      chainWarning: `Settings saved for the bot. On-chain sync failed (${msg}) — confirm the Arbitrum transaction when you save again.`,
    };
  }
}
