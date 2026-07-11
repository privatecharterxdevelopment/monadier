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
  isMissingMaxConcurrentPositionsSchema,
  isMissingNewsTradeModeSchema,
  VAULT_SETTINGS_COLUMNS_BASE,
} from './vaultSettingsSchema';
import { ARBITRUM_ONE_CHAIN_ID } from './usdcArbitrum';

function clampMaxConcurrentPositions(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2) return 2;
  return Math.min(3, Math.max(2, Math.floor(n)));
}

async function patchMaxConcurrentPositions(
  wallet: string,
  maxConcurrentPositions: number
): Promise<void> {
  const slots = clampMaxConcurrentPositions(maxConcurrentPositions);
  const { error } = await supabase
    .from('vault_settings')
    .update({
      max_concurrent_positions: slots,
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    })
    .eq('wallet_address', wallet)
    .eq('chain_id', ARBITRUM_ONE_CHAIN_ID);
  if (error && !isMissingMaxConcurrentPositionsSchema(error.message)) {
    throw new Error(`Could not save max positions: ${error.message}`);
  }
}

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
  maxConcurrentPositions?: number;
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
  const maxConcurrentPositions = clampMaxConcurrentPositions(
    settings.maxConcurrentPositions ?? 2
  );
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
        await patchMaxConcurrentPositions(wallet, maxConcurrentPositions);
        return snapshotFromVaultSettingsRow({
          ...(legacyData as VaultSettingsRow),
          news_trade_mode: settings.newsTradeMode ?? 'filter',
          max_concurrent_positions: maxConcurrentPositions,
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
        max_concurrent_positions: maxConcurrentPositions,
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      };
      const { data: upserted, error: upsertError } = await supabase
        .from('vault_settings')
        .upsert(payload, { onConflict: 'wallet_address,chain_id' })
        .select(VAULT_SETTINGS_COLUMNS_BASE)
        .single();
      if (upsertError) {
        if (isMissingMaxConcurrentPositionsSchema(upsertError.message)) {
          const { max_concurrent_positions: _dropSlots, ...withoutSlots } = payload;
          const { data: upserted2, error: upsertError2 } = await supabase
            .from('vault_settings')
            .upsert(withoutSlots, { onConflict: 'wallet_address,chain_id' })
            .select(
              VAULT_SETTINGS_COLUMNS_BASE.replace(', max_concurrent_positions', '').replace(
                'max_concurrent_positions, ',
                ''
              )
            )
            .single();
          if (upsertError2) {
            throw new Error(`Could not save settings: ${upsertError2.message}`);
          }
          return snapshotFromVaultSettingsRow({
            ...(upserted2 as VaultSettingsRow),
            news_trade_mode: settings.newsTradeMode ?? 'filter',
            max_concurrent_positions: 2,
          });
        }
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

  await patchMaxConcurrentPositions(wallet, maxConcurrentPositions);
  return snapshotFromVaultSettingsRow({
    ...(data as VaultSettingsRow),
    max_concurrent_positions: maxConcurrentPositions,
  });
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
