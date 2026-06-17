import React from 'react';
import { Loader2, Save, Wallet } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import type { VaultSettingsSnapshot } from '../../hooks/useTerminalVaultData';
import TerminalBotSettingsFields from './TerminalBotSettingsFields';
import { useBotSettingsEditor } from './useBotSettingsEditor';

type Props = {
  settings: VaultSettingsSnapshot;
  walletAddress?: string;
  vaultUsd?: number;
  maxTradeUsd?: number;
  disabled?: boolean;
  onSaved: () => void;
};

/** Inline bot settings — same fields & save path as the bot settings modal. */
const TerminalLvrgPanel: React.FC<Props> = ({
  settings,
  walletAddress,
  vaultUsd = 0,
  maxTradeUsd = 0,
  disabled,
  onSaved,
}) => {
  const { open } = useAppKit();
  const editor = useBotSettingsEditor({ settings, walletAddress, onSaved });

  const estPosition = ((vaultUsd * editor.riskLevel) / 100) * editor.leverage;

  return (
    <div className={`term-panel-stack ${disabled ? 'term-panel-stack--locked' : ''}`}>
      <div className="term-panel-card term-panel-card--muted">
        <span className="term-panel-card-label">Bot settings</span>
        <strong className="term-panel-card-value">{editor.leverage}x LVRG</strong>
        <span className="term-panel-card-hint">
          Risk {editor.riskLevel}% · Est. position ${estPosition.toFixed(0)} · Max trade $
          {maxTradeUsd.toFixed(2)}
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
