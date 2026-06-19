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

export type VaultSettingsRow = {
  risk_level_bps?: number | null;
  take_profit_percent?: number | string | null;
  stop_loss_percent?: number | string | null;
  leverage_multiplier?: number | string | null;
  ask_permission?: boolean | null;
  min_win_rate_percent?: number | string | null;
  min_trades_for_win_rate_gate?: number | null;
  auto_trade_enabled?: boolean | null;
};

export type OnChainVaultSettingsFallback = {
  riskLevelPercent: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  maxLeverage: number;
  autoTradeEnabled: boolean;
};

/** Supabase vault_settings is what the bot reads — always prefer DB over on-chain preview. */
export function resolveVaultSettingsSnapshot(
  row: VaultSettingsRow | null | undefined,
  onChain: OnChainVaultSettingsFallback
): VaultSettingsSnapshot {
  if (!row) {
    return {
      riskPct: onChain.riskLevelPercent,
      takeProfit: onChain.takeProfitPercent,
      stopLoss: onChain.stopLossPercent,
      leverage: onChain.maxLeverage,
      autoTradeEnabled: onChain.autoTradeEnabled,
      askPermission: false,
      minWinRate: 0,
      minTradesForWinRate: 5,
    };
  }

  return {
    riskPct: (row.risk_level_bps ?? 500) / 100,
    takeProfit: Number(row.take_profit_percent ?? 5),
    stopLoss: Number(row.stop_loss_percent ?? 1),
    leverage: Number(row.leverage_multiplier ?? 5),
    askPermission: Boolean(row.ask_permission),
    minWinRate: Number(row.min_win_rate_percent ?? 0),
    minTradesForWinRate: Number(row.min_trades_for_win_rate_gate ?? 5),
    autoTradeEnabled: Boolean(row.auto_trade_enabled),
  };
}

export function snapshotFromVaultSettingsRow(row: VaultSettingsRow): VaultSettingsSnapshot {
  return resolveVaultSettingsSnapshot(row, {
    riskLevelPercent: 5,
    takeProfitPercent: 5,
    stopLossPercent: 1,
    maxLeverage: 5,
    autoTradeEnabled: false,
  });
}

/** True when DB bot settings differ from on-chain vault (user must sign setSettings on Arbitrum). */
export function isVaultSettingsOutOfSync(
  db: VaultSettingsSnapshot,
  onChain: OnChainVaultSettingsFallback
): boolean {
  const dbRiskBps = Math.round(db.riskPct * 100);
  const chainRiskBps = Math.round(onChain.riskLevelPercent * 100);
  if (Math.abs(dbRiskBps - chainRiskBps) > 50) return true;
  if (Math.abs(db.leverage - onChain.maxLeverage) >= 5) return true;
  if (Math.abs(db.takeProfit - onChain.takeProfitPercent) > 0.25) return true;
  if (Math.abs(db.stopLoss - onChain.stopLossPercent) > 0.25) return true;
  return false;
}
