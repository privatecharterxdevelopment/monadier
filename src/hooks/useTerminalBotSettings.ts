import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth, DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { useMonadierWallet } from './useMonadierWallet';
import { supabase } from '../lib/supabase';
import { fetchUserWalletAddresses } from '../lib/userWallets';
import { resolveHlTradingWallet } from '../lib/hlTradingWallet';
import { resolveVaultSettingsSnapshot } from '../lib/vaultSettingsSnapshot';
import { snapLeverageToStep } from '../lib/leverageLimits';
import {
  isMissingMaxConcurrentPositionsSchema,
  isMissingNewsTradeModeSchema,
  VAULT_SETTINGS_COLUMNS_BASE,
  VAULT_SETTINGS_COLUMNS_WITH_NEWS,
} from '../lib/vaultSettingsSchema';
import type { VaultSettingsSnapshot } from '../lib/vaultSettingsSnapshot';
import { HL_BOT_HALTED } from '../lib/hyperliquid/hlBotHalt';

export type { VaultSettingsSnapshot };

/** Legacy Supabase partition key — HL bot settings only (no on-chain vault). */
const BOT_SETTINGS_CHAIN_ID = 42161;

const defaultSettings: VaultSettingsSnapshot = {
  riskPct: 5,
  takeProfit: 0,
  stopLoss: 0,
  leverage: 5,
  askPermission: false,
  minWinRate: 0,
  minTradesForWinRate: 5,
  autoTradeEnabled: false,
  hlBotStrategy: 'standard' as const,
  newsTradeMode: 'filter' as const,
  maxConcurrentPositions: 2,
};

export type TerminalBotSettings = {
  settings: VaultSettingsSnapshot;
  isLoading: boolean;
  error: string | null;
};

export function useTerminalBotSettings(refreshKey = 0) {
  const { address: monadierAddress } = useMonadierWallet();
  const { isDemoUser, user, profile } = useAuth();
  const [linkedWallets, setLinkedWallets] = useState<string[]>([]);

  useEffect(() => {
    if (isDemoUser || !user) {
      setLinkedWallets([]);
      return;
    }
    let cancelled = false;
    void fetchUserWalletAddresses(monadierAddress, false).then((list) => {
      if (!cancelled) setLinkedWallets(list);
    });
    return () => {
      cancelled = true;
    };
  }, [monadierAddress, isDemoUser, user?.id, profile?.wallet_address]);

  const wallet = useMemo(() => {
    if (isDemoUser) return DEMO_WALLET_ADDRESS as `0x${string}`;
    if (!user) return undefined;
    const resolved = resolveHlTradingWallet({
      connectedAddress: monadierAddress,
      linkedWallets: linkedWallets,
    });
    return resolved ? (resolved as `0x${string}`) : undefined;
  }, [isDemoUser, user, monadierAddress, linkedWallets]);

  const [data, setData] = useState<TerminalBotSettings>({
    settings: defaultSettings,
    isLoading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!wallet) {
      setData({ settings: defaultSettings, isLoading: false, error: null });
      return;
    }

    setData((d) => ({ ...d, isLoading: true, error: null }));

    try {
      let row = null;
      let error: { message: string } | null = null;

      const full = await supabase
        .from('vault_settings')
        .select(VAULT_SETTINGS_COLUMNS_WITH_NEWS)
        .eq('wallet_address', wallet.toLowerCase())
        .eq('chain_id', BOT_SETTINGS_CHAIN_ID)
        .maybeSingle();
      row = full.data;
      error = full.error;

      if (error && isMissingNewsTradeModeSchema(error.message)) {
        const legacy = await supabase
          .from('vault_settings')
          .select(VAULT_SETTINGS_COLUMNS_BASE)
          .eq('wallet_address', wallet.toLowerCase())
          .eq('chain_id', BOT_SETTINGS_CHAIN_ID)
          .maybeSingle();
        row = legacy.data;
        error = legacy.error;
      }

      if (error && isMissingMaxConcurrentPositionsSchema(error.message)) {
        const withoutSlots = VAULT_SETTINGS_COLUMNS_WITH_NEWS.replace(
          ', max_concurrent_positions',
          ''
        ).replace('max_concurrent_positions, ', '');
        const legacy = await supabase
          .from('vault_settings')
          .select(withoutSlots)
          .eq('wallet_address', wallet.toLowerCase())
          .eq('chain_id', BOT_SETTINGS_CHAIN_ID)
          .maybeSingle();
        row = legacy.data;
        error = legacy.error;
      }

      if (error) throw error;

      const vaultRow = (row ?? null) as import('../lib/vaultSettingsSnapshot').VaultSettingsRow | null;
      const snapshot = resolveVaultSettingsSnapshot(vaultRow, {
        riskLevelPercent: (vaultRow?.risk_level_bps ?? 500) / 100,
        takeProfitPercent: Number(vaultRow?.take_profit_percent ?? 0),
        stopLossPercent: Number(vaultRow?.stop_loss_percent ?? 0),
        maxLeverage: Number(vaultRow?.leverage_multiplier ?? 10),
        autoTradeEnabled: HL_BOT_HALTED ? false : Boolean(vaultRow?.auto_trade_enabled),
      });

      setData({
        settings: {
          ...snapshot,
          leverage: snapLeverageToStep(snapshot.leverage),
        },
        isLoading: false,
        error: null,
      });
    } catch (e) {
      setData({
        settings: defaultSettings,
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load bot settings',
      });
    }
  }, [wallet]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return { ...data, wallet, reload: load };
}
