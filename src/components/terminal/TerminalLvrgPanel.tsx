import React, { useState } from 'react';
import { Loader2, Save, Wallet } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useHlLeverageCap } from '../../hooks/useHlLeverageCap';
import type { VaultSettingsSnapshot } from '../../lib/vaultSettingsSnapshot';
import TerminalBotSettingsFields from './TerminalBotSettingsFields';
import { useBotSettingsEditor } from './useBotSettingsEditor';
import { HL_BOT_STRATEGY_HINTS, HL_BOT_STRATEGY_LABELS } from '../../lib/hlBotStrategy';
import { saveHlBotStrategyMode } from '../../lib/saveHlBotStrategyMode';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';

type Props = {
  settings: VaultSettingsSnapshot;
  walletAddress?: string;
  hlBalanceUsd?: number;
  disabled?: boolean;
  botRunning?: boolean;
  onBlockedSave?: () => void;
  onSaved: () => void;
};

/** Inline HL bot settings — leverage, risk, TP/SL. */
const TerminalLvrgPanel: React.FC<Props> = ({
  settings,
  walletAddress,
  hlBalanceUsd = 0,
  disabled,
  botRunning = false,
  onBlockedSave,
  onSaved,
}) => {
  const { open } = useAppKit();
  const { publicClient, walletClient } = useWeb3();
  const { isDemoUser } = useAuth();
  const { planTier } = useSubscription();
  const { caps } = useHlLeverageCap();
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const editor = useBotSettingsEditor({
    settings,
    walletAddress,
    hlSliderMax: caps.sliderMax,
    onSaved,
  });

  const collateralUsd = (hlBalanceUsd * editor.riskLevel) / 100;
  const notionalUsd = collateralUsd * editor.leverage;

  const settingsLocked = botRunning;

  const switchMode = async (next: typeof editor.hlBotStrategy) => {
    if (!walletAddress || next === settings.hlBotStrategy) {
      editor.setHlBotStrategy(next);
      return;
    }
    setModeBusy(true);
    setModeError(null);
    try {
      await saveHlBotStrategyMode(walletAddress.toLowerCase(), settings, next, {
        planTier,
        publicClient,
        walletClient,
        userAddress: walletAddress.toLowerCase() as `0x${string}`,
        isDemoUser,
      });
      editor.setHlBotStrategy(next);
      onSaved();
    } catch (e: unknown) {
      setModeError(e instanceof Error ? e.message : 'Could not save mode');
    } finally {
      setModeBusy(false);
    }
  };

  return (
    <div className="term-panel-stack">
      <div className="term-panel-card term-panel-card--muted">
        <span className="term-panel-card-label">Bot mode</span>
        <div className="term-bot-mode-toggle" role="group" aria-label="Bot strategy">
          {(['standard', 'profit_grabber'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`term-btn-sm ${editor.hlBotStrategy === mode ? 'term-btn-sm--primary' : ''}`}
              disabled={disabled || editor.isLoading || modeBusy}
              onClick={() => void switchMode(mode)}
            >
              {HL_BOT_STRATEGY_LABELS[mode]}
            </button>
          ))}
        </div>
        <span className="term-panel-card-hint">{HL_BOT_STRATEGY_HINTS[editor.hlBotStrategy]}</span>
        {modeError ? (
          <span className="term-panel-card-hint term-panel-card-hint--warn">{modeError}</span>
        ) : null}
      </div>

      <div
        className={
          settingsLocked
            ? 'term-lvrg-locked-section term-lvrg-locked-section--dim'
            : 'term-lvrg-locked-section'
        }
      >
        <div className="term-panel-card term-panel-card--muted">
          <span className="term-panel-card-label">Bot settings</span>
          <strong className="term-panel-card-value">{editor.leverage}x leverage</strong>
          <span className="term-panel-card-hint">
            Risk {editor.riskLevel}% of HL balance · ~${collateralUsd.toFixed(2)} margin · ~$
            {notionalUsd.toFixed(0)} notional · HL caps BTC {caps.btc}x / ETH {caps.eth}x
          </span>
        </div>

        <TerminalBotSettingsFields
          variant="panel"
          planTier={editor.planTier}
          hlSliderMax={caps.sliderMax}
          hlBtcMax={caps.btc}
          hlEthMax={caps.eth}
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
          disabled={disabled || settingsLocked || editor.isLoading}
          walletConnected={editor.walletConnected}
          notice={editor.notice}
          error={editor.error}
          showAutoTrade={false}
        />

        <p className="term-hint">
          To run the bot, open the <strong>Bot</strong> tab and press <strong>Start bot</strong>{' '}
          after deposit and agent approval. LVRG here only saves risk and leverage.
        </p>

        <button
          type="button"
          className="term-btn-sm flex-1 justify-center w-full"
          disabled={
            editor.isLoading || (settingsLocked && editor.tradingParamsChanged) || (disabled && editor.walletConnected)
          }
          onClick={() => {
            if (settingsLocked) {
              onBlockedSave?.();
              return;
            }
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

        {settingsLocked ? (
          <button
            type="button"
            className="term-lvrg-section-blocker"
            aria-label="Stop bot to change leverage, risk, TP or SL"
            onClick={() => onBlockedSave?.()}
          />
        ) : null}
      </div>
    </div>
  );
};

export default TerminalLvrgPanel;
