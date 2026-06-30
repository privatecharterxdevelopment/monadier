import React from 'react';
import { Loader2, Save, Wallet } from 'lucide-react';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
import { useHlLeverageCap } from '../../hooks/useHlLeverageCap';
import type { VaultSettingsSnapshot } from '../../lib/vaultSettingsSnapshot';
import TerminalBotSettingsFields from './TerminalBotSettingsFields';
import { useBotSettingsEditor } from './useBotSettingsEditor';
import { BRAND_NAME } from '../../lib/brand';

type Props = {
  settings: VaultSettingsSnapshot;
  walletAddress?: string;
  hlBalanceUsd?: number;
  disabled?: boolean;
  botRunning?: boolean;
  onBlockedSave?: () => void;
  onSaved: () => void;
};

/** Inline HL bot settings — leverage, risk, win-rate gate. */
const TerminalLvrgPanel: React.FC<Props> = ({
  settings,
  walletAddress,
  hlBalanceUsd = 0,
  disabled,
  botRunning = false,
  onBlockedSave,
  onSaved,
}) => {
  const { open } = useMonadierAppKit();
  const { caps } = useHlLeverageCap();
  const editor = useBotSettingsEditor({
    settings,
    walletAddress,
    hlSliderMax: caps.sliderMax,
    profitOnlyHoldLosers: true,
    onSaved,
  });

  const settingsLocked = botRunning;

  return (
    <div className="term-panel-stack">
      <div
        className={
          settingsLocked
            ? 'term-lvrg-locked-section term-lvrg-locked-section--dim'
            : 'term-lvrg-locked-section'
        }
      >
        <TerminalBotSettingsFields
          variant="lvrg"
          planTier={editor.planTier}
          hlSliderMax={caps.sliderMax}
          hlBtcMax={caps.btc}
          hlEthMax={caps.eth}
          hlBalanceUsd={hlBalanceUsd}
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

        <p className="term-hint term-lvrg-save-hint">
          Saves risk, leverage, and win-rate gate for the {BRAND_NAME} bot. Start/stop trading in the{' '}
          <strong>Bot</strong> tab.
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
            aria-label="Stop bot to change leverage, risk, or win-rate gate"
            onClick={() => onBlockedSave?.()}
          />
        ) : null}
      </div>
    </div>
  );
};

export default TerminalLvrgPanel;
