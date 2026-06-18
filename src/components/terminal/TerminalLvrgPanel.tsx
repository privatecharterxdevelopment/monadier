import React from 'react';
import { Loader2, Save, Wallet } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import type { VaultSettingsSnapshot } from '../../lib/vaultSettingsSnapshot';
import TerminalBotSettingsFields from './TerminalBotSettingsFields';
import { useBotSettingsEditor } from './useBotSettingsEditor';

type Props = {
  settings: VaultSettingsSnapshot;
  walletAddress?: string;
  hlBalanceUsd?: number;
  disabled?: boolean;
  onSaved: () => void;
};

/** Inline HL bot settings — leverage, risk, TP/SL. */
const TerminalLvrgPanel: React.FC<Props> = ({
  settings,
  walletAddress,
  hlBalanceUsd = 0,
  disabled,
  onSaved,
}) => {
  const { open } = useAppKit();
  const editor = useBotSettingsEditor({ settings, walletAddress, onSaved });

  const collateralUsd = (hlBalanceUsd * editor.riskLevel) / 100;
  const notionalUsd = collateralUsd * editor.leverage;

  return (
    <div className={`term-panel-stack ${disabled ? 'term-panel-stack--locked' : ''}`}>
      <div className="term-panel-card term-panel-card--muted">
        <span className="term-panel-card-label">Bot settings</span>
        <strong className="term-panel-card-value">{editor.leverage}x leverage</strong>
        <span className="term-panel-card-hint">
          Risk {editor.riskLevel}% of HL balance · ~${collateralUsd.toFixed(2)} margin · ~$
          {notionalUsd.toFixed(0)} notional per trade
        </span>
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
        {editor.success ? 'Saved' : !editor.walletConnected ? 'Connect to save' : 'Save settings'}
      </button>
    </div>
  );
};

export default TerminalLvrgPanel;
