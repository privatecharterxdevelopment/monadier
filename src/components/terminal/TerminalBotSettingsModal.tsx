import React from 'react';
import { Settings, Loader2, CheckCircle, Zap, Wallet } from 'lucide-react';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
import TerminalModalFrame from './TerminalModalFrame';
import TerminalBotSettingsFields from './TerminalBotSettingsFields';
import { useBotSettingsEditor } from './useBotSettingsEditor';
import type { VaultSettingsSnapshot } from '../../lib/vaultSettingsSnapshot';

const RISK_PRESETS = [1, 5, 25, 50, 100] as const;

export type BotSetupPhase = 'connect' | 'loading' | 'approve' | 'fund' | 'ready';

type Props = {
  setupPhase?: BotSetupPhase;
  minHlUsd?: number;
  /** @deprecated use minHlUsd */
  minVaultUsd?: number;
  settings: VaultSettingsSnapshot;
  walletAddress?: string;
  startMode?: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const TerminalBotSettingsModal: React.FC<Props> = ({
  setupPhase = 'ready',
  minHlUsd,
  minVaultUsd,
  settings,
  walletAddress,
  startMode = false,
  onClose,
  onSuccess,
}) => {
  const minUsd = minHlUsd ?? minVaultUsd ?? 20;
  const setupHint: Record<BotSetupPhase, string> = {
    connect: 'Connect your wallet first.',
    loading: 'Loading Hyperliquid balance…',
    approve: 'Press Start bot on the Bot tab — includes one-time Hyperliquid approvals (1–2 signatures).',
    fund: `Deposit at least $${minUsd} native USDC on Arbitrum only (not BNB/BSC or other chains) — Funds tab.`,
    ready: 'Adjust risk and leverage — then Start bot on the Bot tab.',
  };

  const stepDone = (n: number) => {
    const order: Record<BotSetupPhase, number> = {
      connect: 0,
      loading: 1,
      approve: 2,
      fund: 3,
      ready: 4,
    };
    return order[setupPhase] >= n;
  };

  const { open } = useMonadierAppKit();
  const editor = useBotSettingsEditor({
    settings,
    walletAddress,
    startMode,
    allowAutoTrade: setupPhase === 'ready',
    onSaved: onSuccess,
  });

  const handleSave = async () => {
    if (!editor.walletConnected) {
      open();
      return;
    }
    if (!editor.hasChanges) {
      onClose();
      return;
    }
    const result = await editor.save();
    if (!result.ok) return;
    if (result.notice) {
      setTimeout(onSuccess, 2200);
    } else {
      onSuccess();
    }
  };

  const footer = (
    <button
      type="button"
      className={`term-modal-primary ${startMode && editor.autoTrade && editor.walletConnected ? 'term-modal-primary--go' : ''}`}
      onClick={() => void handleSave()}
      disabled={editor.isLoading || editor.success}
    >
      {editor.isLoading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          {startMode && editor.autoTrade ? 'Starting bot…' : 'Saving…'}
        </>
      ) : editor.success ? (
        <>
          <CheckCircle size={16} />
          Saved
        </>
      ) : !editor.walletConnected ? (
        <>
          <Wallet size={16} />
          Connect wallet
        </>
      ) : startMode && editor.autoTrade ? (
        <>
          <Zap size={16} />
          Save & start bot
        </>
      ) : (
        'Save settings'
      )}
    </button>
  );

  return (
    <TerminalModalFrame
      title="Bot settings"
      subtitle="Risk, leverage, take-profit & stop-loss"
      icon={<Settings size={18} />}
      onClose={onClose}
      closeDisabled={editor.isLoading}
      footer={footer}
      wide
    >
      <div className="term-settings-setup">
        <p className="term-modal-label">Setup progress</p>
        <div className="term-flow-steps" aria-label="Setup">
          {(['Connect', 'Agent', 'Deposit', 'Start'] as const).map((label, i) => (
            <span
              key={label}
              className={`term-flow-step ${stepDone(i) ? 'term-flow-step--done' : ''} ${
                (i === 0 && setupPhase === 'connect') ||
                (i === 1 && (setupPhase === 'loading' || setupPhase === 'approve')) ||
                (i === 2 && setupPhase === 'fund') ||
                (i === 3 && setupPhase === 'ready')
                  ? 'term-flow-step--current'
                  : ''
              }`}
            >
              {label}
            </span>
          ))}
        </div>
        <p className="term-phase-hint">
          {!editor.walletConnected
            ? 'Connect your wallet to save settings and run the bot.'
            : setupHint[setupPhase]}
        </p>
      </div>

      {!editor.walletConnected && (
        <p className="term-modal-note term-modal-note--warn">
          Preview settings below — connect wallet to save and trade.
        </p>
      )}

      <TerminalBotSettingsFields
        variant="modal"
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
        maxConcurrentPositions={editor.maxConcurrentPositions}
        setMaxConcurrentPositions={editor.setMaxConcurrentPositions}
        disabled={editor.isLoading}
        walletConnected={editor.walletConnected}
        notice={editor.notice}
        error={editor.error}
      />
    </TerminalModalFrame>
  );
};

export default TerminalBotSettingsModal;
export { RISK_PRESETS };
