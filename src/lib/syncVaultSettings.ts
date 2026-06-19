import type { PublicClient, WalletClient } from 'viem';
import { VaultClient, VAULT_CHAIN_ID } from './vault';
import { supabase } from './supabase';
import { clampLeverage } from './leverageLimits';
import {
  snapshotFromVaultSettingsRow,
  type VaultSettingsRow,
} from './vaultSettingsSnapshot';
import type { HlBotStrategy } from './hlBotStrategy';

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
  hlBotStrategy?: HlBotStrategy;
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
  settings: VaultSettingsSnapshot;
};

async function saveVaultSettingsToDatabase(
  wallet: string,
  settings: VaultSettingsWrite,
  leverage: number
): Promise<VaultSettingsSnapshot> {
  const { data, error } = await supabase.rpc('save_vault_trading_settings', {
    p_wallet_address: wallet,
    p_chain_id: VAULT_CHAIN_ID,
    p_auto_trade_enabled: settings.autoTradeEnabled,
    p_risk_level_bps: Math.round(settings.riskPct * 100),
    p_leverage_multiplier: leverage,
    p_take_profit_percent: settings.takeProfit,
    p_stop_loss_percent: settings.stopLoss,
    p_ask_permission: settings.askPermission ?? false,
    p_min_win_rate_percent: settings.minWinRate ?? 0,
    p_min_trades_for_win_rate_gate: settings.minTradesForWinRate ?? 5,
    p_hl_bot_strategy: settings.hlBotStrategy ?? 'standard',
  });

  if (error) {
    if (error.message.includes('Could not find the function')) {
      const payload = {
        wallet_address: wallet,
        chain_id: VAULT_CHAIN_ID,
        auto_trade_enabled: settings.autoTradeEnabled,
        risk_level_bps: Math.round(settings.riskPct * 100),
        take_profit_percent: settings.takeProfit,
        stop_loss_percent: settings.stopLoss,
        leverage_multiplier: leverage,
        ask_permission: settings.askPermission ?? false,
        min_win_rate_percent: settings.minWinRate ?? 0,
        min_trades_for_win_rate_gate: settings.minTradesForWinRate ?? 5,
        hl_bot_strategy: settings.hlBotStrategy ?? 'standard',
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      };
      const { data: upserted, error: upsertError } = await supabase
        .from('vault_settings')
        .upsert(payload, { onConflict: 'wallet_address,chain_id' })
        .select(
          'risk_level_bps, take_profit_percent, stop_loss_percent, leverage_multiplier, auto_trade_enabled, ask_permission, min_win_rate_percent, min_trades_for_win_rate_gate, hl_bot_strategy'
        )
        .single();
      if (upsertError) {
        throw new Error(`Could not save settings: ${upsertError.message}`);
      }
      return snapshotFromVaultSettingsRow(upserted as VaultSettingsRow);
    }
    throw new Error(`Could not save settings: ${error.message}`);
  }

  if (!data) {
    throw new Error('Settings save returned no data — try again.');
  }

  return snapshotFromVaultSettingsRow(data as VaultSettingsRow);
}

/** Persist vault settings to Supabase (source of truth for bot), then optional Arbitrum sync. */
export async function persistVaultSettings(
  opts: PersistVaultSettingsOptions
): Promise<PersistVaultSettingsResult> {
  const wallet = opts.settings.walletAddress.toLowerCase();
  const leverage = clampLeverage(opts.settings.leverage, opts.planTier);

  const savedSettings = await saveVaultSettingsToDatabase(wallet, opts.settings, leverage);

  const canChain =
    !opts.isDemoUser &&
    opts.publicClient &&
    opts.walletClient &&
    opts.userAddress;

  if (!canChain || (!opts.syncTradingParams && !opts.syncAutoTrade)) {
    return { savedToDatabase: true, syncedOnChain: false, settings: savedSettings };
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

    return { savedToDatabase: true, syncedOnChain: true, settings: savedSettings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'On-chain sync failed';
    return {
      savedToDatabase: true,
      syncedOnChain: false,
      settings: savedSettings,
      chainWarning: `Saved for the bot. On-chain sync needs your wallet on Arbitrum (${msg}).`,
    };
  }
}
