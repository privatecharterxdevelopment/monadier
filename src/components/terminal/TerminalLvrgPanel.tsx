import React from 'react';
import { Loader2, Save, Wallet } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import type { VaultSettingsSnapshot } from '../../hooks/useTerminalVaultData';
import TerminalBotSettingsFields from './TerminalBotSettingsFields';
import { useBotSettingsEditor } from './useBotSettingsEditor';
import { isVaultSettingsOutOfSync } from '../../lib/vaultSettingsSnapshot';

type Props = {
  settings: VaultSettingsSnapshot;
  walletAddress?: string;
  vaultUsd?: number;
  maxTradeUsd?: number;
  /** On-chain risk % (from vault contract) for sync warning */
  riskPctOnChain?: number;
  /** On-chain max leverage for sync warning */
  chainMaxLeverage?: number;
  disabled?: boolean;
  onSaved: () => void;
};

/** Inline bot settings — same fields & save path as the bot settings modal. */
const TerminalLvrgPanel: React.FC<Props> = ({
  settings,
  walletAddress,
  vaultUsd = 0,
  maxTradeUsd = 0,
  riskPctOnChain = 5,
  chainMaxLeverage = 10,
  disabled,
  onSaved,
}) => {
  const { open } = useAppKit();
  const editor = useBotSettingsEditor({ settings, walletAddress, onSaved });

  const collateralUsd = (vaultUsd * editor.riskLevel) / 100;
  const notionalUsd = collateralUsd * editor.leverage;
  const outOfSync = isVaultSettingsOutOfSync(
    {
      riskPct: editor.riskLevel,
      leverage: editor.leverage,
      takeProfit: editor.takeProfit,
      stopLoss: editor.stopLoss,
      askPermission: editor.askPermission,
      minWinRate: editor.minWinRate,
      minTradesForWinRate: editor.minTradesForWinRate,
      autoTradeEnabled: editor.autoTrade,
    },
    {
      riskLevelPercent: riskPctOnChain,
      maxLeverage: chainMaxLeverage,
      takeProfitPercent: settings.takeProfit,
      stopLossPercent: settings.stopLoss,
      autoTradeEnabled: settings.autoTradeEnabled,
    }
  );

  return (
    <div className={`term-panel-stack ${disabled ? 'term-panel-stack--locked' : ''}`}>
      <div className="term-panel-card term-panel-card--muted">
        <span className="term-panel-card-label">Bot settings</span>
        <strong className="term-panel-card-value">{editor.leverage}x LVRG</strong>
        <span className="term-panel-card-hint">
          Risk {editor.riskLevel}% · Collateral ~${collateralUsd.toFixed(2)} · Notional ~$
          {notionalUsd.toFixed(0)}
          {outOfSync && maxTradeUsd > 0
            ? ` · On-chain noch ${riskPctOnChain}% / ${chainMaxLeverage}x (max $${maxTradeUsd.toFixed(2)})`
            : ''}
        </span>
        {outOfSync ? (
          <span className="term-panel-card-hint term-panel-card-hint--warn">
            Settings saved for the HL bot (database). Legacy vault on-chain sync is optional.
          </span>
        ) : null}
      </div>

      <TerminalBotSettingsFields
        variant="panel"
        planTier={editor.planTier}
        riskLevel={editor.riskLevel}
        setRiskLevel={editor.setRiskLevel}
        leverage={editor.leverage}
        setLeverage={editor.setLeverage}
        takeProfit={editor.takeProfit}
        setTakeProfit={editor.setTakeProfit}
        stopLoss={editor.stopLoss}
        setStopLoss={editor.setStopLoss}
        autoTrade={editor.autoTrade}
        setAutoTrade={editor.setAutoTrade}
        askPermission={editor.askPermission}
        setAskPermission={editor.setAskPermission}
        minWinRate={editor.minWinRate}
        setMinWinRate={editor.setMinWinRate}
        minTradesForWinRate={editor.minTradesForWinRate}
        setMinTradesForWinRate={editor.setMinTradesForWinRate}
        disabled={disabled || editor.isLoading}
        walletConnected={editor.walletConnected}
        onArbitrum={editor.onArbitrum}
        notice={editor.notice}
        error={editor.error}
      />

      <button
        type="button"
        className="term-btn-sm flex-1 justify-center w-full"
        disabled={editor.isLoading || (disabled && editor.walletConnected)}
        onClick={() => {
          if (!editor.walletConnected) {
            open();
            return;
          }
          void editor.save();
        }}
      >
        {editor.isLoading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : !editor.walletConnected ? (
          <Wallet size={14} />
        ) : (
          <Save size={14} />
        )}
        {editor.success ? 'Saved' : !editor.walletConnected ? 'Connect to save' : 'Save bot settings'}
      </button>
    </div>
  );
};

export default TerminalLvrgPanel;
