import React, { useState } from 'react';
import { Settings, Loader2, AlertCircle, CheckCircle, Zap, Wallet } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { VAULT_CHAIN_ID } from '../../lib/vault';
import { useAuth } from '../../contexts/AuthContext';
import { persistVaultSettings } from '../../lib/syncVaultSettings';
import TerminalModalFrame from './TerminalModalFrame';
import {
  getLeverageChips,
  getMaxLeverageLabel,
  clampLeverage,
} from '../../lib/leverageLimits';

const RISK_PRESETS = [1, 5, 25, 50, 100] as const;

export type BotSetupPhase = 'connect' | 'loading' | 'network' | 'fund' | 'ready';

type Props = {
  setupPhase?: BotSetupPhase;
  minVaultUsd?: number;
  currentRiskLevel: number;
  autoTradeEnabled: boolean;
  currentTakeProfit: number;
  currentStopLoss: number;
  currentLeverage: number;
  currentAskPermission?: boolean;
  currentMinWinRate?: number;
  currentMinTradesForWinRate?: number;
  startMode?: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const TerminalBotSettingsModal: React.FC<Props> = ({
  currentRiskLevel,
  autoTradeEnabled: initialAutoTrade,
  currentTakeProfit,
  currentStopLoss,
  currentLeverage,
  currentAskPermission = false,
  currentMinWinRate = 0,
  currentMinTradesForWinRate = 5,
  startMode = false,
  setupPhase = 'ready',
  minVaultUsd = 50,
  onClose,
  onSuccess,
}) => {
  const setupHint: Record<BotSetupPhase, string> = {
    connect: 'Connect your wallet to use the vault bot.',
    loading: 'Syncing vault balance and settings…',
    network: 'Switch to Arbitrum (ARB in the header).',
    fund: `Deposit at least $${minVaultUsd} USDC into the vault.`,
    ready: 'Setup complete — adjust risk and LVRG settings below.',
  };

  const stepDone = (n: number) => {
    const order: Record<BotSetupPhase, number> = {
      connect: 0,
      loading: 1,
      network: 1,
      fund: 2,
      ready: 3,
    };
    return order[setupPhase] >= n;
  };

  const { open } = useAppKit();
  const { address, publicClient, walletClient, chainId } = useWeb3();
  const { isDemoUser } = useAuth();
  const { linkWallet, planTier } = useSubscription();

  const walletConnected = !!address;
  const leverageOptions = getLeverageChips(planTier);
  const maxLevLabel = getMaxLeverageLabel(planTier);

  const [riskLevel, setRiskLevel] = useState(currentRiskLevel);
  const [autoTrade, setAutoTrade] = useState(startMode ? true : initialAutoTrade);
  const [takeProfit, setTakeProfit] = useState(currentTakeProfit);
  const [stopLoss, setStopLoss] = useState(currentStopLoss);
  const [leverage, setLeverage] = useState(currentLeverage);
  const [askPermission, setAskPermission] = useState(currentAskPermission);
  const [minWinRate, setMinWinRate] = useState(currentMinWinRate);
  const [minTradesForWinRate, setMinTradesForWinRate] = useState(currentMinTradesForWinRate);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onArbitrum = chainId === VAULT_CHAIN_ID;

  const tradingParamsChanged =
    riskLevel !== currentRiskLevel ||
    takeProfit !== currentTakeProfit ||
    stopLoss !== currentStopLoss ||
    leverage !== currentLeverage;

  const hasChanges =
    tradingParamsChanged ||
    autoTrade !== initialAutoTrade ||
    askPermission !== currentAskPermission ||
    minWinRate !== currentMinWinRate ||
    minTradesForWinRate !== currentMinTradesForWinRate;

  const handleSave = async () => {
    if (!walletConnected) {
      open();
      return;
    }
    if (!publicClient || !walletClient || chainId !== VAULT_CHAIN_ID) {
      setError('Switch to Arbitrum to save settings.');
      return;
    }
    if (!hasChanges) {
      onClose();
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      await persistVaultSettings({
        settings: {
          walletAddress: address,
          autoTradeEnabled: autoTrade,
          riskPct: riskLevel,
          leverage,
          takeProfit,
          stopLoss,
          askPermission,
          minWinRate,
          minTradesForWinRate,
        },
        planTier,
        publicClient,
        walletClient,
        userAddress: address as `0x${string}`,
        isDemoUser,
        syncTradingParams: tradingParamsChanged && !isDemoUser,
        syncAutoTrade: autoTrade !== initialAutoTrade && !isDemoUser,
      });

      if (autoTrade && autoTrade !== initialAutoTrade) {
        await linkWallet(address);
      }

      setSuccess(true);
      setTimeout(onSuccess, 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setIsLoading(false);
    }
  };

  const footer = (
    <button
      type="button"
      className={`term-modal-primary ${startMode && autoTrade && walletConnected ? 'term-modal-primary--go' : ''}`}
      onClick={handleSave}
      disabled={isLoading || success || (walletConnected && !onArbitrum)}
    >
      {isLoading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          {startMode && autoTrade ? 'Starting bot…' : 'Saving…'}
        </>
      ) : success ? (
        <>
          <CheckCircle size={16} />
          Saved
        </>
      ) : !walletConnected ? (
        <>
          <Wallet size={16} />
          Connect wallet
        </>
      ) : startMode && autoTrade ? (
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
      closeDisabled={isLoading}
      footer={footer}
      wide
    >
      <div className="term-settings-setup">
        <p className="term-modal-label">Setup progress</p>
        <div className="term-flow-steps" aria-label="Setup">
          {(['Connect', 'Vault', 'Fund', 'Trade'] as const).map((label, i) => (
            <span
              key={label}
              className={`term-flow-step ${stepDone(i) ? 'term-flow-step--done' : ''} ${
                (i === 0 && setupPhase === 'connect') ||
                (i === 1 && (setupPhase === 'loading' || setupPhase === 'network')) ||
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
          {!walletConnected
            ? 'Connect your wallet to save settings and run the bot.'
            : setupHint[setupPhase]}
        </p>
      </div>

      {!walletConnected && (
        <p className="term-modal-note term-modal-note--warn">
          Preview settings below — connect wallet to save and trade.
        </p>
      )}

      {walletConnected && !onArbitrum && (
        <p className="term-modal-note term-modal-note--warn">
          Switch to Arbitrum in the header before changing bot settings.
        </p>
      )}

      <div className="term-modal-toggle-row">
        <div>
          <p className="term-modal-toggle-title">Auto-trading</p>
          <p className="term-modal-hint">Bot trades from vault balance on signals</p>
        </div>
        <button
          type="button"
          className={`term-modal-switch ${autoTrade ? 'term-modal-switch--on' : ''}`}
          onClick={() => setAutoTrade(!autoTrade)}
          disabled={isLoading}
          aria-pressed={autoTrade}
        >
          <span className="term-modal-switch-knob" />
        </button>
      </div>

      <p className="term-modal-label">Risk per trade</p>
      <div className="term-modal-chip-row">
        {RISK_PRESETS.map((v) => (
          <button
            key={v}
            type="button"
            className={`term-modal-chip ${riskLevel === v ? 'term-modal-chip--on' : ''}`}
            onClick={() => setRiskLevel(v)}
            disabled={isLoading}
          >
            {v}%
          </button>
        ))}
      </div>
      <input
        type="range"
        min={1}
        max={100}
        value={riskLevel}
        onChange={(e) => setRiskLevel(parseInt(e.target.value, 10))}
        className="term-modal-range"
        disabled={isLoading}
      />

      <p className="term-modal-label">Leverage (LVRG)</p>
      <p className="term-modal-hint mb-2">Up to {maxLevLabel} via GMX.</p>
      <div className="term-modal-chip-row term-modal-chip-row--wrap">
        {leverageOptions.map((v) => (
          <button
            key={v}
            type="button"
            className={`term-modal-chip ${leverage === v ? 'term-modal-chip--on' : ''}`}
            onClick={() => setLeverage(v)}
            disabled={isLoading}
          >
            {v}x
          </button>
        ))}
      </div>

      {autoTrade && (
        <div className="term-modal-toggle-row term-modal-toggle-row--compact">
          <div>
            <p className="term-modal-toggle-title">Ask before each trade</p>
            <p className="term-modal-hint">5 min to approve via notification</p>
          </div>
          <button
            type="button"
            className={`term-modal-switch ${askPermission ? 'term-modal-switch--on' : ''}`}
            onClick={() => setAskPermission(!askPermission)}
            disabled={isLoading}
            aria-pressed={askPermission}
          >
            <span className="term-modal-switch-knob" />
          </button>
        </div>
      )}

      <div className="term-modal-gate-box">
        <div className="term-modal-gate-head">
          <p className="term-modal-label term-modal-label--flush">Win rate gate</p>
          <span
            className={`term-modal-gate-badge${minWinRate > 0 ? ' term-modal-gate-badge--on' : ''}`}
          >
            {minWinRate > 0 ? 'Active' : 'Off'}
          </span>
        </div>
        <p className="term-modal-hint">
          Optional safety: the bot pauses <strong>new</strong> trades if your recent closed-trade win
          rate drops below your threshold. Set 0% to disable.
        </p>

        <p className="term-modal-label">Min win rate to open (0 = off)</p>
        <input
          type="range"
          min={0}
          max={80}
          step={5}
          value={minWinRate}
          onChange={(e) => setMinWinRate(parseInt(e.target.value, 10))}
          className="term-modal-range"
          disabled={isLoading}
          aria-valuetext={minWinRate === 0 ? 'Gate off' : `${minWinRate} percent`}
        />
        <p className="term-modal-hint">
          {minWinRate === 0
            ? 'Drag the slider above 0% to activate the gate.'
            : `Pause new trades if win rate falls below ${minWinRate}%.`}
        </p>

        <label className="term-modal-label" htmlFor="term-min-trades">
          Closed trades before gate applies
        </label>
        <div className="term-modal-gate-stepper">
          <button
            type="button"
            className="term-modal-chip"
            disabled={isLoading || minTradesForWinRate <= 1}
            onClick={() => setMinTradesForWinRate((v) => Math.max(1, v - 1))}
            aria-label="Fewer trades"
          >
            −
          </button>
          <input
            id="term-min-trades"
            type="number"
            className="term-modal-input term-modal-input--center"
            min={1}
            max={50}
            value={minTradesForWinRate}
            onChange={(e) => {
              const raw = parseInt(e.target.value, 10);
              if (!Number.isNaN(raw)) {
                setMinTradesForWinRate(Math.min(50, Math.max(1, raw)));
              }
            }}
            disabled={isLoading}
          />
          <button
            type="button"
            className="term-modal-chip"
            disabled={isLoading || minTradesForWinRate >= 50}
            onClick={() => setMinTradesForWinRate((v) => Math.min(50, v + 1))}
            aria-label="More trades"
          >
            +
          </button>
        </div>
        <p className="term-modal-hint term-modal-hint--flush">
          {minWinRate === 0
            ? `Threshold preset at ${minTradesForWinRate} trades — activates once min win rate is above 0%.`
            : `Gate evaluates only after ${minTradesForWinRate} closed trades on this wallet.`}
        </p>
      </div>

      <div className="term-modal-grid-2">
        <div>
          <label className="term-modal-label" htmlFor="term-tp">
            Take profit %
          </label>
          <input
            id="term-tp"
            type="number"
            className="term-modal-input"
            value={takeProfit}
            min={0.1}
            step={0.1}
            onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)}
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="term-modal-label" htmlFor="term-sl">
            Profit lock %
          </label>
          <input
            id="term-sl"
            type="number"
            className="term-modal-input"
            value={stopLoss}
            min={0.1}
            step={0.1}
            onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
            disabled={isLoading}
          />
        </div>
      </div>
      <p className="term-modal-hint">
        Take profit closes at collateral PnL %. Profit lock activates at lock% + 0.1% (e.g. 1.1% →
        lock 1%) and closes if PnL falls back to the lock level.
      </p>

      {error && (
        <div className="term-modal-alert term-modal-alert--err">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
    </TerminalModalFrame>
  );
};

export default TerminalBotSettingsModal;
