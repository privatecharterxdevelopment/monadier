import { normalizeHlBotStrategy } from './hlBotStrategy';
import { HL_BOT_EFFECTIVE } from './hlBotEffectiveSettings';
import type { HlBotStrategy } from './hlBotStrategy';

export type VaultSettingsSnapshot = {
  riskPct: number;
  takeProfit: number;
  stopLoss: number;
  leverage: number;
  askPermission: boolean;
  minWinRate: number;
  minTradesForWinRate: number;
  autoTradeEnabled: boolean;
  hlBotStrategy: HlBotStrategy;
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
  hl_bot_strategy?: string | null;
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
      askPermission: false,
      minWinRate: 0,
      minTradesForWinRate: 5,
      autoTradeEnabled: onChain.autoTradeEnabled,
      hlBotStrategy: 'standard',
    };
  }

  return {
    riskPct: (row.risk_level_bps ?? 500) / 100,
    takeProfit: Math.max(
      Number(row.take_profit_percent ?? HL_BOT_EFFECTIVE.minTakeProfitPercent),
      HL_BOT_EFFECTIVE.minTakeProfitPercent
    ),
    stopLoss: Math.max(
      Number(row.stop_loss_percent ?? HL_BOT_EFFECTIVE.minStopLossPercent),
      HL_BOT_EFFECTIVE.minStopLossPercent
    ),
    leverage: Number(row.leverage_multiplier ?? 5),
    askPermission: Boolean(row.ask_permission),
    minWinRate: Number(row.min_win_rate_percent ?? 0),
    minTradesForWinRate: Number(row.min_trades_for_win_rate_gate ?? 5),
    autoTradeEnabled: Boolean(row.auto_trade_enabled),
    hlBotStrategy: normalizeHlBotStrategy(row.hl_bot_strategy),
  };
}

export function snapshotFromVaultSettingsRow(row: VaultSettingsRow): VaultSettingsSnapshot {
  return resolveVaultSettingsSnapshot(row, {
    riskLevelPercent: 5,
    takeProfitPercent: HL_BOT_EFFECTIVE.minTakeProfitPercent,
    stopLossPercent: HL_BOT_EFFECTIVE.minStopLossPercent,
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
