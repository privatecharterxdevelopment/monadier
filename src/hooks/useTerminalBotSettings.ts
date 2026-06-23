import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useAuth, DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { useMonadierWallet } from './useMonadierWallet';
import { supabase } from '../lib/supabase';
import { fetchUserWalletAddresses } from '../lib/userWallets';
import { resolveHlTradingWallet } from '../lib/hlTradingWallet';
import { resolveVaultSettingsSnapshot } from '../lib/vaultSettingsSnapshot';
import { snapLeverageToStep } from '../lib/leverageLimits';
import type { VaultSettingsSnapshot } from '../lib/vaultSettingsSnapshot';

export type { VaultSettingsSnapshot };

/** Legacy Supabase partition key — HL bot settings only (no on-chain vault). */
const BOT_SETTINGS_CHAIN_ID = 42161;

const defaultSettings: VaultSettingsSnapshot = {
  riskPct: 5,
  takeProfit: 0,
  stopLoss: 4,
  leverage: 5,
  askPermission: false,
  minWinRate: 0,
  minTradesForWinRate: 5,
  autoTradeEnabled: false,
  hlBotStrategy: 'standard' as const,
  newsTradeMode: 'filter' as const,
};

export type TerminalBotSettings = {
  settings: VaultSettingsSnapshot;
  isLoading: boolean;
  error: string | null;
};

export function useTerminalBotSettings(refreshKey = 0) {
  const { isConnected, address } = useWeb3();
  const { address: monadierAddress } = useMonadierWallet();
  const { isDemoUser, user, profile } = useAuth();
  const [linkedWallets, setLinkedWallets] = useState<string[]>([]);

  useEffect(() => {
    if (isDemoUser) return;
    let cancelled = false;
    void fetchUserWalletAddresses(address, false).then((list) => {
      if (!cancelled) setLinkedWallets(list);
    });
    return () => {
      cancelled = true;
    };
  }, [address, isDemoUser, user?.id, profile?.wallet_address]);

  const wallet = useMemo(() => {
    if (isDemoUser) return DEMO_WALLET_ADDRESS as `0x${string}`;
    const connected = monadierAddress ?? (isConnected && address ? address : undefined);
    const resolved = resolveHlTradingWallet({
      connectedAddress: connected,
      linkedWallets: linkedWallets,
    });
    return resolved ? (resolved as `0x${string}`) : undefined;
  }, [isDemoUser, monadierAddress, isConnected, address, linkedWallets]);

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
      const { data: row, error } = await supabase
        .from('vault_settings')
        .select(
          'take_profit_percent, stop_loss_percent, ask_permission, leverage_multiplier, risk_level_bps, min_win_rate_percent, min_trades_for_win_rate_gate, auto_trade_enabled, execution_venue, hl_bot_strategy, news_trade_mode'
        )
        .eq('wallet_address', wallet.toLowerCase())
        .eq('chain_id', BOT_SETTINGS_CHAIN_ID)
        .maybeSingle();

      if (error) throw error;

      const snapshot = resolveVaultSettingsSnapshot(row, {
        riskLevelPercent: (row?.risk_level_bps ?? 500) / 100,
        takeProfitPercent: Number(row?.take_profit_percent ?? 5),
        stopLossPercent: Number(row?.stop_loss_percent ?? 3),
        maxLeverage: Number(row?.leverage_multiplier ?? 10),
        autoTradeEnabled: Boolean(row?.auto_trade_enabled),
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
