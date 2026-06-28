import type { PublicClient, WalletClient } from 'viem';
import { supabase } from './supabase';
import { clampLeverage } from './leverageLimits';
import {
  snapshotFromVaultSettingsRow,
  type VaultSettingsRow,
} from './vaultSettingsSnapshot';
import type { HlBotStrategy } from './hlBotStrategy';
import type { NewsTradeMode } from './newsTradeMode';
import {
  isMissingNewsTradeModeSchema,
  VAULT_SETTINGS_COLUMNS_BASE,
} from './vaultSettingsSchema';
import { ARBITRUM_ONE_CHAIN_ID } from './usdcArbitrum';

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
  newsTradeMode?: NewsTradeMode;
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
  settings: import('./vaultSettingsSnapshot').VaultSettingsSnapshot;
};

async function saveVaultSettingsToDatabase(
  wallet: string,
  settings: VaultSettingsWrite,
  leverage: number
): Promise<import('./vaultSettingsSnapshot').VaultSettingsSnapshot> {
  const rpcPayload = {
    p_wallet_address: wallet,
    p_chain_id: ARBITRUM_ONE_CHAIN_ID,
    p_auto_trade_enabled: settings.autoTradeEnabled,
    p_risk_level_bps: Math.round(settings.riskPct * 100),
    p_leverage_multiplier: leverage,
    p_take_profit_percent: settings.takeProfit,
    p_stop_loss_percent: settings.stopLoss,
    p_ask_permission: settings.askPermission ?? false,
    p_min_win_rate_percent: settings.minWinRate ?? 0,
    p_min_trades_for_win_rate_gate: settings.minTradesForWinRate ?? 5,
    p_hl_bot_strategy: settings.hlBotStrategy ?? 'standard',
    p_news_trade_mode: settings.newsTradeMode ?? 'filter',
  };

  const { data, error } = await supabase.rpc('save_vault_trading_settings', rpcPayload);

  if (error) {
    const legacy =
      error.message.includes('Could not find the function') ||
      isMissingNewsTradeModeSchema(error.message);

    if (legacy) {
      const { p_news_trade_mode: _drop, ...legacyRpc } = rpcPayload;
      const { data: legacyData, error: legacyRpcError } = await supabase.rpc(
        'save_vault_trading_settings',
        legacyRpc
      );
      if (!legacyRpcError && legacyData) {
        return snapshotFromVaultSettingsRow({
          ...(legacyData as VaultSettingsRow),
          news_trade_mode: settings.newsTradeMode ?? 'filter',
        });
      }

      const payload = {
        wallet_address: wallet,
        chain_id: ARBITRUM_ONE_CHAIN_ID,
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
        .select(VAULT_SETTINGS_COLUMNS_BASE)
        .single();
      if (upsertError) {
        throw new Error(`Could not save settings: ${upsertError.message}`);
      }
      return snapshotFromVaultSettingsRow({
        ...(upserted as VaultSettingsRow),
        news_trade_mode: settings.newsTradeMode ?? 'filter',
      });
    }
    throw new Error(`Could not save settings: ${error.message}`);
  }

  if (!data) {
    throw new Error('Settings save returned no data — try again.');
  }

  return snapshotFromVaultSettingsRow(data as VaultSettingsRow);
}

/** Persist bot settings to Supabase (HL bot source of truth — no on-chain vault). */
export async function persistVaultSettings(
  opts: PersistVaultSettingsOptions
): Promise<PersistVaultSettingsResult> {
  const wallet = opts.settings.walletAddress.toLowerCase();
  const leverage = clampLeverage(opts.settings.leverage, opts.planTier);
  const savedSettings = await saveVaultSettingsToDatabase(wallet, opts.settings, leverage);
  return { savedToDatabase: true, syncedOnChain: false, settings: savedSettings };
}
