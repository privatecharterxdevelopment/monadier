import { useCallback, useEffect, useState } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useAuth, DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { VaultClient, VAULT_CHAIN_ID, getArbitrumPublicClient } from '../lib/vault';
import { supabase } from '../lib/supabase';

const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const;
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const;

export type ActiveVaultPosition = {
  isActive: boolean;
  isLong: boolean;
  collateral: string;
  leverage: number;
  entryPrice: string;
  token: 'ETH' | 'BTC';
  currentPrice?: number;
  pnl?: number;
  pnlPercent?: number;
};

export type VaultSettingsSnapshot = {
  riskPct: number;
  takeProfit: number;
  stopLoss: number;
  leverage: number;
  askPermission: boolean;
  minWinRate: number;
  minTradesForWinRate: number;
  autoTradeEnabled: boolean;
};

export type TerminalVaultData = {
  /** Withdrawable USDC (respects active positions / solvency). */
  vaultUsd: number;
  /** Full withdrawable string (6 decimals) for exact withdrawals. */
  vaultUsdExact: string;
  /** Full vault balance before withdrawable cap. */
  balanceUsd: number;
  /** Full on-chain balance string (6 decimals). */
  balanceExact: string;
  maxTradeUsd: number;
  riskPctOnChain: number;
  position: ActiveVaultPosition | null;
  settings: VaultSettingsSnapshot;
  isLoading: boolean;
  error: string | null;
};

const defaultSettings: VaultSettingsSnapshot = {
  riskPct: 5,
  takeProfit: 5,
  stopLoss: 1,
  leverage: 1,
  askPermission: false,
  minWinRate: 0,
  minTradesForWinRate: 5,
  autoTradeEnabled: false,
};

export function useTerminalVaultData(refreshKey = 0) {
  const { isConnected, address, chainId, walletClient } = useWeb3();
  const { isDemoUser } = useAuth();
  const wallet = (isDemoUser ? DEMO_WALLET_ADDRESS : address) as `0x${string}` | undefined;
  const walletOnArbitrum = isDemoUser || chainId === VAULT_CHAIN_ID;

  const [data, setData] = useState<TerminalVaultData>({
    vaultUsd: 0,
    vaultUsdExact: '0',
    balanceUsd: 0,
    balanceExact: '0',
    maxTradeUsd: 0,
    riskPctOnChain: 5,
    position: null,
    settings: defaultSettings,
    isLoading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!wallet || (!isConnected && !isDemoUser)) {
      setData((d) => ({ ...d, isLoading: false, vaultUsd: 0, balanceUsd: 0, position: null }));
      return;
    }

    setData((d) => ({ ...d, isLoading: true, error: null }));

    try {
      if (isDemoUser) {
        const { data: row } = await supabase
          .from('vault_settings')
          .select(
            'demo_vault_balance, risk_level_bps, take_profit_percent, stop_loss_percent, leverage_multiplier, auto_trade_enabled, ask_permission, min_win_rate_percent, min_trades_for_win_rate_gate'
          )
          .eq('wallet_address', DEMO_WALLET_ADDRESS)
          .eq('chain_id', VAULT_CHAIN_ID)
          .maybeSingle();

        const bal = Number(row?.demo_vault_balance ?? 0);
        setData({
          vaultUsd: bal,
          vaultUsdExact: bal.toFixed(6),
          balanceUsd: bal,
          balanceExact: bal.toFixed(6),
          maxTradeUsd: bal * 0.5,
          riskPctOnChain: (row?.risk_level_bps ?? 5000) / 100,
          position: null,
          settings: {
            riskPct: (row?.risk_level_bps ?? 5000) / 100,
            takeProfit: Number(row?.take_profit_percent ?? 10),
            stopLoss: Number(row?.stop_loss_percent ?? 5),
            leverage: Number(row?.leverage_multiplier ?? 25),
            askPermission: Boolean(row?.ask_permission),
            minWinRate: Number(row?.min_win_rate_percent ?? 0),
            minTradesForWinRate: Number(row?.min_trades_for_win_rate_gate ?? 5),
            autoTradeEnabled: Boolean(row?.auto_trade_enabled ?? true),
          },
          isLoading: false,
          error: null,
        });
        return;
      }

      const arbClient = getArbitrumPublicClient();
      const client = new VaultClient(
        arbClient as never,
        (walletClient ?? arbClient) as never,
        VAULT_CHAIN_ID
      );
      const status = await client.getUserStatus(wallet);
      const balanceUsd = parseFloat(status.balanceFormatted);
      const balanceExact = status.balanceFormatted;
      let vaultUsd = balanceUsd;
      let vaultUsdExact = balanceExact;
      try {
        const w = await client.getWithdrawable(wallet);
        vaultUsd = parseFloat(w.formatted);
        vaultUsdExact = w.formatted;
      } catch {
        /* use balance */
      }

      let position: ActiveVaultPosition | null = null;
      try {
        const eth = await client.getPosition(wallet, WETH);
        if (eth.isActive) {
          position = {
            isActive: true,
            isLong: eth.isLong,
            collateral: eth.collateralFormatted,
            leverage: eth.leverage,
            entryPrice: parseFloat(eth.entryPriceFormatted).toFixed(2),
            token: 'ETH',
          };
        } else {
          const btc = await client.getPosition(wallet, WBTC);
          if (btc.isActive) {
            position = {
              isActive: true,
              isLong: btc.isLong,
              collateral: btc.collateralFormatted,
              leverage: btc.leverage,
              entryPrice: parseFloat(btc.entryPriceFormatted).toFixed(2),
              token: 'BTC',
            };
          }
        }
      } catch {
        position = null;
      }

      const { data: row } = await supabase
        .from('vault_settings')
        .select(
          'take_profit_percent, stop_loss_percent, ask_permission, leverage_multiplier, risk_level_bps, min_win_rate_percent, min_trades_for_win_rate_gate, auto_trade_enabled'
        )
        .eq('wallet_address', wallet.toLowerCase())
        .eq('chain_id', VAULT_CHAIN_ID)
        .maybeSingle();

      setData({
        vaultUsd,
        vaultUsdExact,
        balanceUsd,
        balanceExact,
        maxTradeUsd: parseFloat(status.maxTradeSizeFormatted) || 0,
        riskPctOnChain: status.riskLevelPercent,
        position,
        settings: {
          riskPct: row?.risk_level_bps != null ? row.risk_level_bps / 100 : status.riskLevelPercent,
          takeProfit: Number(row?.take_profit_percent ?? 5),
          stopLoss: Number(row?.stop_loss_percent ?? 1),
          leverage: Number(row?.leverage_multiplier ?? 1),
          askPermission: Boolean(row?.ask_permission),
          minWinRate: Number(row?.min_win_rate_percent ?? 0),
          minTradesForWinRate: Number(row?.min_trades_for_win_rate_gate ?? 5),
          autoTradeEnabled: status.autoTradeEnabled || Boolean(row?.auto_trade_enabled),
        },
        isLoading: false,
        error: null,
      });
    } catch (e) {
      setData((d) => ({
        ...d,
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load vault',
      }));
    }
  }, [wallet, isConnected, isDemoUser, walletClient]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const pos = data.position;
    if (!pos?.isActive) return;

    const fetchPrice = async () => {
      try {
        const symbol = pos.token === 'BTC' ? 'BTCUSDT' : 'ETHUSDT';
        const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
        const json = await res.json();
        const price = parseFloat(json.price);
        if (!price) return;
        const entry = parseFloat(pos.entryPrice);
        const collateral = parseFloat(pos.collateral);
        const lev = pos.leverage || 1;
        const priceChange = pos.isLong ? price - entry : entry - price;
        const pnlPercent = (priceChange / entry) * lev * 100;
        const pnl = (collateral * pnlPercent) / 100;
        setData((d) => ({
          ...d,
          position: d.position
            ? { ...d.position, currentPrice: price, pnl, pnlPercent }
            : null,
        }));
      } catch {
        /* ignore */
      }
    };

    fetchPrice();
    const id = setInterval(fetchPrice, 5000);
    return () => clearInterval(id);
  }, [
    data.position?.isActive,
    data.position?.token,
    data.position?.entryPrice,
    data.position?.isLong,
    data.position?.collateral,
    data.position?.leverage,
  ]);

  return { ...data, wallet, onArbitrum: walletOnArbitrum, reload: load };
}
