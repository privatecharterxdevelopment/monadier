import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Play,
  Square,
  Settings,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { persistVaultSettings } from '../../lib/syncVaultSettings';
import { ensureBotSubscription } from '../../lib/ensureBotSubscription';
import {
  disableHlBotExecution,
  enableHlBotExecution,
  MIN_HL_BOT_USD,
} from '../../lib/hyperliquid/hlBotAgent';
import { registerWalletsForHistory } from '../../lib/userWallets';
import { completeHlBotApprovals } from '../../lib/hyperliquid/hlBotApprovals';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { getHlBuilderConfig } from '../../lib/hyperliquid/builderConfig';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { useBotRuntimeTimer } from '../../hooks/useBotRuntimeTimer';
import { useBotServerBlockers } from '../../hooks/useBotServerBlockers';
import { clearBotRuntimeTimer, markBotRuntimeStarted } from '../../lib/botRuntimeTimer';
import {
  disableStaleHlBotAutoTrade,
  effectiveHlBotRunning,
  isHlBotReadyToRun,
  shouldDisableStaleHlBotAutoTrade,
} from '../../lib/hlBotGates';
import { getHlBotSidebarStatus } from '../../lib/hlBotUserStatus';
import {
  hlBotOnboardingStorageKey,
  readHlBotOnboardingComplete,
  writeHlBotOnboardingComplete,
} from '../../lib/hlBotOnboarding';
import { fireProfileOnboardingConfetti } from '../../lib/confettiCelebration';
import HlBotSetupSteps from './HlBotSetupSteps';
import HlBotSetupGuideModal from './HlBotSetupGuideModal';
import ProTradeDepositModal from '../protrade/ProTradeDepositModal';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import TerminalBotSettingsModal from './TerminalBotSettingsModal';
import TerminalLvrgPanel from './TerminalLvrgPanel';
import TerminalBotSettingsStrip from './TerminalBotSettingsStrip';
type PanelTab = 'bot' | 'lvrg' | 'funds';

type Props = {
  metrics: Dashboard2Metrics;
  onRefresh: () => void;
  onOpenHistory?: () => void;
  /** @deprecated use fundsAction */
  vaultAction?: 'deposit' | 'withdraw' | null;
  /** @deprecated use onFundsActionHandled */
  onVaultActionHandled?: () => void;
  fundsAction?: 'deposit' | 'withdraw' | null;
  onFundsActionHandled?: () => void;
  onRequireSignIn?: (reason: string) => void;
};

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type SetupPhase = 'connect' | 'loading' | 'approve' | 'fund' | 'ready';

const TerminalTradePanel: React.FC<Props> = ({
  metrics,
  onRefresh,
  onOpenHistory,
  vaultAction,
  onVaultActionHandled,
  fundsAction = vaultAction,
  onFundsActionHandled = onVaultActionHandled,
  onRequireSignIn,
}) => {
  const { open } = useAppKit();
  const { isConnected, address, publicClient, walletClient } = useWeb3();
  const { isDemoUser, isAuthenticated, user } = useAuth();
  const { linkWallet, planTier } = useSubscription();
  const [panelTab, setPanelTab] = useState<PanelTab>('bot');
  const [settingsTick, setSettingsTick] = useState(0);
  const botSettings = useTerminalBotSettings(settingsTick);
  const hlSetup = useHlBotSetup(address ?? undefined);
  const builderConfig = getHlBuilderConfig();
  const [showFundsModal, setShowFundsModal] = useState(false);
  const [fundsModalTab, setFundsModalTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [showSettings, setShowSettings] = useState(false);
  const [startMode, setStartMode] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [stopNotice, setStopNotice] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const walletReady = isConnected || isDemoUser;
  const wallet = botSettings.wallet;

  const onboardingKey = useMemo(
    () => hlBotOnboardingStorageKey(user?.id, wallet ?? address ?? null),
    [user?.id, wallet, address]
  );
  const [setupGuideComplete, setSetupGuideComplete] = useState(() =>
    readHlBotOnboardingComplete(onboardingKey)
  );

  const hlFundingUsd = hlSetup.accountUsd;
  const autoTradeDb = botSettings.settings.autoTradeEnabled;
  const autoTradeOn = metrics.autoTradeEnabled;
  const botRunning = effectiveHlBotRunning(
    autoTradeOn,
    hlFundingUsd,
    hlSetup.agentApproved,
    hlSetup.builderFeeApproved
  );

  useEffect(() => {
    if (readHlBotOnboardingComplete(onboardingKey)) {
      setSetupGuideComplete(true);
      return;
    }
    if (walletReady && (botRunning || autoTradeDb)) {
      writeHlBotOnboardingComplete(onboardingKey);
      setSetupGuideComplete(true);
    }
  }, [onboardingKey, walletReady, botRunning, autoTradeDb]);
  const botSyncMismatch = autoTradeDb !== metrics.autoTradeEnabled && !metrics.isLoading;
  const timerWallet = wallet ?? address ?? undefined;
  const botRuntime = useBotRuntimeTimer(timerWallet, Boolean(walletReady && botRunning));
  const serverBlockers = useBotServerBlockers(timerWallet, Boolean(botRunning));
  const hasOpenPosition = metrics.openPositionsCount > 0;

  const phase: SetupPhase = useMemo(() => {
    if (!walletReady) return 'connect';
    if (hlSetup.loading && hlFundingUsd === 0) return 'loading';
    if (hlSetup.phase !== 'connect') return hlSetup.phase;
    if (hlFundingUsd < MIN_HL_BOT_USD) return 'fund';
    if (!hlSetup.agentApproved || (hlSetup.builderFeeEnabled && !hlSetup.builderFeeApproved)) {
      return 'approve';
    }
    return 'ready';
  }, [
    walletReady,
    hlSetup.loading,
    hlSetup.phase,
    hlSetup.agentApproved,
    hlSetup.builderFeeEnabled,
    hlSetup.builderFeeApproved,
    hlFundingUsd,
  ]);

  const sidebarStatus = useMemo(
    () =>
      getHlBotSidebarStatus({
        walletReady,
        phase,
        botRunning,
        hlBalanceUsd: hlFundingUsd,
        agentApproved: hlSetup.agentApproved,
        builderFeeApproved: hlSetup.builderFeeApproved,
        builderFeeEnabled: hlSetup.builderFeeEnabled,
        hasOpenPosition,
        serverBlockers,
        runtimeLabel: botRuntime.formatted || (botRunning ? '0s' : undefined),
      }),
    [
      walletReady,
      phase,
      botRunning,
      hlFundingUsd,
      hlSetup.agentApproved,
      hlSetup.builderFeeApproved,
      hlSetup.builderFeeEnabled,
      hasOpenPosition,
      serverBlockers,
      botRuntime.formatted,
    ]
  );

  const startBlocker = useMemo((): string | null => {
    if (!walletReady) return null;
    if (hlSetup.loading && hlFundingUsd === 0) return 'Loading Hyperliquid balance…';
    if (hlFundingUsd < MIN_HL_BOT_USD) {
      return `Deposit at least $${MIN_HL_BOT_USD} USDC on Hyperliquid to start the bot.`;
    }
    if (!isDemoUser && !isAuthenticated) return 'Sign in to Monadier, then press Start bot.';
    return null;
  }, [
    walletReady,
    hlSetup.loading,
    hlFundingUsd,
    isDemoUser,
    isAuthenticated,
  ]);

  const needsHlApproval =
    !hlSetup.agentApproved ||
    (hlSetup.builderFeeEnabled && !hlSetup.builderFeeApproved);

  const canStartBot =
    (phase === 'ready' || phase === 'approve') && !startBlocker && !botRunning;

  useEffect(() => {
    if (!wallet || hlSetup.loading || botSettings.isLoading || !autoTradeDb) return;
    if (
      !shouldDisableStaleHlBotAutoTrade(hlFundingUsd, hlSetup.agentApproved, {
        hlLoaded: hlSetup.hlLoaded,
        agentLoaded: hlSetup.agentLoaded,
        builderFeeApproved: hlSetup.builderFeeApproved,
      })
    ) {
      return;
    }

    let cancelled = false;
    void disableStaleHlBotAutoTrade(wallet)
      .then(() => {
        if (cancelled) return;
        clearBotRuntimeTimer(timerWallet ?? wallet);
        refreshAll();
      })
      .catch(() => {
        /* metrics hook also reconciles */
      });

    return () => {
      cancelled = true;
    };
  }, [
    wallet,
    timerWallet,
    hlSetup.loading,
    botSettings.isLoading,
    autoTradeDb,
    hlFundingUsd,
    hlSetup.agentApproved,
    hlSetup.builderFeeApproved,
    hlSetup.hlLoaded,
    hlSetup.agentLoaded,
  ]);

  const requireAccount = (reason: string, next: () => void) => {
    if (!isDemoUser && !isAuthenticated) {
      onRequireSignIn?.(reason);
      return;
    }
    next();
  };

  const openFunds = (tab: 'deposit' | 'withdraw') => {
    setFundsModalTab(tab);
    setShowFundsModal(true);
  };

  useEffect(() => {
    if (!fundsAction) return;
    if (!isDemoUser && !isAuthenticated) {
      onRequireSignIn?.(
        fundsAction === 'deposit'
          ? 'Sign in before depositing to Hyperliquid.'
          : 'Sign in before withdrawing from Hyperliquid.'
      );
      onFundsActionHandled?.();
      return;
    }
    openFunds(fundsAction);
    setPanelTab('funds');
    onFundsActionHandled?.();
  }, [fundsAction, onFundsActionHandled, isDemoUser, isAuthenticated, onRequireSignIn]);

  const refreshAll = () => {
    onRefresh();
    setSettingsTick((n) => n + 1);
    void hlSetup.refresh();
  };

  const parseBotTxError = (err: unknown): string => {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err && 'shortMessage' in err
          ? String((err as { shortMessage: string }).shortMessage)
          : 'Failed to start bot';
    if (msg.includes('User rejected') || msg.includes('denied')) {
      return 'Signature cancelled in wallet.';
    }
    if (/Must deposit before performing actions/i.test(msg)) {
      return 'Deposit USDC on Hyperliquid first (min $20), then approve the agent.';
    }
    if (/extra agent already used|agent already/i.test(msg)) {
      return 'This API wallet is already registered on Hyperliquid. If you approved before, refresh the page — otherwise revoke an old API key at app.hyperliquid.xyz → More → API.';
    }
    if (/linked to another/i.test(msg)) {
      return 'This wallet is linked to another Monadier account. Sign in with that account or use a different wallet.';
    }
    if (/409|duplicate key|user_wallets/i.test(msg)) {
      return 'Could not link wallet — refresh the page and try Start bot again.';
    }
    return msg;
  };

  const persistBotRunning = async (
    autoTradeEnabled: boolean,
    ready?: { agentApproved: boolean; builderFeeApproved: boolean }
  ) => {
    if (!wallet) throw new Error('Connect your wallet first.');
    const s = botSettings.settings;
    const agentOk = ready?.agentApproved ?? hlSetup.agentApproved;
    const builderOk = ready?.builderFeeApproved ?? hlSetup.builderFeeApproved;
    if (autoTradeEnabled) {
      if (!isHlBotReadyToRun(hlFundingUsd, agentOk, builderOk)) {
        throw new Error('Deposit USDC, approve the agent, and approve the platform fee before starting the bot.');
      }
      await enableHlBotExecution(wallet);
    } else {
      await disableHlBotExecution(wallet);
    }
    await persistVaultSettings({
      settings: {
        walletAddress: wallet,
        autoTradeEnabled,
        riskPct: s.riskPct,
        leverage: s.leverage,
        takeProfit: s.takeProfit,
        stopLoss: s.stopLoss,
        askPermission: s.askPermission,
        minWinRate: s.minWinRate,
        minTradesForWinRate: s.minTradesForWinRate,
      },
      planTier,
      publicClient: publicClient ?? null,
      walletClient: walletClient ?? null,
      userAddress: wallet,
      isDemoUser,
      syncTradingParams: false,
      syncAutoTrade: false,
    });
  };

  const startButtonLabel = useMemo(() => {
    if (needsHlApproval) {
      return hlSetup.agentApproved ? 'Approve fee & start bot' : 'Approve & start bot';
    }
    return 'Start bot';
  }, [needsHlApproval, hlSetup.agentApproved]);

  const handleStartBot = async () => {
    if (!walletReady) {
      open();
      return;
    }
    if (!wallet || !address) {
      setBotError('Connect your wallet first.');
      return;
    }
    if (!isDemoUser && !isAuthenticated) {
      onRequireSignIn?.('Sign in to Monadier, then press Start bot.');
      return;
    }
    if (phase === 'connect' || phase === 'loading') {
      setBotError(startBlocker ?? 'Loading Hyperliquid account…');
      return;
    }
    if (hlFundingUsd < MIN_HL_BOT_USD) {
      setBotError(`Deposit at least $${MIN_HL_BOT_USD} USDC on Hyperliquid to start the bot.`);
      return;
    }
    if (phase !== 'ready' && phase !== 'approve') {
      setBotError(startBlocker ?? 'Complete setup before starting the bot.');
      return;
    }
    setBotError(null);
    if (!isDemoUser && (!publicClient || !walletClient)) {
      setBotError('Wallet not ready — unlock your wallet and try again.');
      return;
    }

    setBotBusy(true);
    try {
      if (!isDemoUser && user?.id) {
        await registerWalletsForHistory([address], user.id);
      }

      let agentApproved = hlSetup.agentApproved;
      let builderFeeApproved = hlSetup.builderFeeApproved;
      if (needsHlApproval) {
        await completeHlBotApprovals({
          walletClient: walletClient!,
          walletAddress: address,
          userId: user?.id,
        });
        agentApproved = true;
        builderFeeApproved = true;
      }

      await ensureBotSubscription();
      await persistBotRunning(true, { agentApproved, builderFeeApproved });
      markBotRuntimeStarted(timerWallet ?? wallet);
      if (!readHlBotOnboardingComplete(onboardingKey)) {
        writeHlBotOnboardingComplete(onboardingKey);
        setSetupGuideComplete(true);
        fireProfileOnboardingConfetti();
      }
      refreshAll();
    } catch (err: unknown) {
      setBotError(parseBotTxError(err));
    } finally {
      setBotBusy(false);
    }
  };

  const handleStopBot = async () => {
    if (!walletReady || !wallet) {
      open();
      return;
    }
    if (!isDemoUser && !isAuthenticated) {
      onRequireSignIn?.('Sign in to Monadier, then press Stop bot.');
      return;
    }
    setBotError(null);
    setStopNotice(null);
    setBotBusy(true);
    try {
      await persistBotRunning(false);
      clearBotRuntimeTimer(timerWallet ?? wallet);
      setSettingsTick((n) => n + 1);
      refreshAll();
      onRefresh();
      setStopNotice(
        'Bot stopped — no new trades. Stop is instant on Hyperliquid (no MetaMask). Open positions stay until TP/SL or manual close.'
      );
    } catch (e: unknown) {
      setBotError(e instanceof Error ? e.message : 'Failed to stop bot');
    } finally {
      setBotBusy(false);
    }
  };

  return (
    <aside className="term-trade-panel">
      <div className="term-trade-header">
        <div className="term-trade-header-top">
          <p className="term-trade-title">Hyperliquid bot</p>
          <div className="term-trade-header-actions">
            {setupGuideComplete && walletReady && (
              <button
                type="button"
                className="term-icon-btn term-icon-btn--subtle"
                onClick={() => setShowSetupGuide(true)}
                title="How the bot works"
                aria-label="How the bot works"
              >
                <Info size={14} />
              </button>
            )}
            <button type="button" className="term-icon-btn" onClick={refreshAll} title="Refresh">
              <RefreshCw
                size={14}
                className={metrics.isLoading || hlSetup.loading ? 'animate-spin' : ''}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="term-panel-tabs">
        {(
          [
            { id: 'bot' as const, label: 'Bot' },
            { id: 'lvrg' as const, label: 'LVRG' },
            { id: 'funds' as const, label: 'Funds' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`term-panel-tab ${panelTab === t.id ? 'term-panel-tab--on' : ''}`}
            onClick={() => setPanelTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="term-trade-body">
        {panelTab === 'bot' && (
          <div className="term-panel-stack">
            {!walletReady ? (
              <div className="term-panel-card term-panel-card--muted term-connect-banner">
                <p className="term-hint term-connect-banner-text">
                  Connect your wallet to set up the Hyperliquid bot.
                </p>
                <button
                  type="button"
                  className="term-btn-sm term-btn-sm--primary w-full justify-center"
                  onClick={() => open()}
                >
                  <Wallet size={14} />
                  Connect wallet
                </button>
              </div>
            ) : (
              <div
                className={`term-panel-card term-panel-card--muted hl-bot-status-card hl-bot-status-card--${sidebarStatus.tone}`}
              >
                <span className="term-panel-card-label">Bot status</span>
                <strong
                  className={`term-panel-card-value hl-bot-status-headline ${
                    botRunning ? 'term-pnl-pos' : ''
                  }`}
                >
                  {sidebarStatus.headline}
                </strong>
                <p className="hl-bot-status-detail">{sidebarStatus.detail}</p>
                {botSyncMismatch && (
                  <p className="term-hint term-hint--warn">
                    Bot state out of sync — press Start bot again to register with the server.
                  </p>
                )}
                <p className="term-panel-card-hint">
                  HL balance {fmt(hlFundingUsd)} · withdrawable {fmt(hlSetup.withdrawableUsd)}
                </p>
                {walletReady && phase === 'ready' && builderConfig.enabled && (
                  <p className="term-panel-card-hint term-hint--subtle">
                    Winning bot closes: 10% of profit collected automatically via Hyperliquid (one-time
                    fee approval). No fee on losing trades. Opens: no extra platform fee.
                  </p>
                )}
              </div>
            )}

            {walletReady && !setupGuideComplete && (
              <HlBotSetupSteps
                walletReady={walletReady}
                hlBalanceUsd={hlFundingUsd}
                agentApproved={hlSetup.agentApproved}
                builderFeeApproved={hlSetup.builderFeeApproved}
                builderFeeEnabled={hlSetup.builderFeeEnabled}
                botRunning={botRunning}
                currentStep={sidebarStatus.setupStep}
              />
            )}

            <TerminalBotSettingsStrip
              settings={botSettings.settings}
              disabled={walletReady && hlSetup.loading}
              onAdjust={() => setPanelTab('lvrg')}
            />

            {botError && (
              <div className="term-panel-alert">
                <AlertTriangle size={14} />
                <span>{botError}</span>
              </div>
            )}

            {walletReady && phase === 'fund' && !botRunning && (
              <button
                type="button"
                className="term-btn-sm term-btn-sm--primary w-full justify-center"
                onClick={() => openFunds('deposit')}
              >
                <ArrowDownLeft size={14} />
                Deposit USDC
              </button>
            )}

            <div className="flex gap-2">
              {walletReady && botRunning ? (
                <button
                  type="button"
                  className="term-btn-sm term-btn-sm--primary flex-1 justify-center"
                  disabled={botBusy}
                  onClick={() => void handleStopBot()}
                >
                  {botBusy ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                  {botBusy ? 'Stopping…' : 'Stop bot'}
                </button>
              ) : walletReady && canStartBot ? (
                <button
                  type="button"
                  className="term-btn-sm term-btn-sm--primary flex-1 justify-center"
                  disabled={botBusy}
                  title={
                    needsHlApproval
                      ? 'One-time Hyperliquid signatures (agent + platform fee), then bot starts'
                      : !canStartBot && startBlocker
                        ? startBlocker
                        : undefined
                  }
                  onClick={() => void handleStartBot()}
                >
                  {botBusy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : needsHlApproval ? (
                    <ShieldCheck size={14} />
                  ) : (
                    <Play size={14} />
                  )}
                  {botBusy ? (needsHlApproval ? 'Approving…' : 'Starting…') : startButtonLabel}
                </button>
              ) : !walletReady ? (
                <button
                  type="button"
                  className="term-btn-sm term-btn-sm--primary flex-1 justify-center"
                  onClick={() => open()}
                >
                  <Wallet size={14} />
                  Connect wallet
                </button>
              ) : null}
            </div>

            {onOpenHistory && (
              <button type="button" className="term-link-btn" onClick={onOpenHistory}>
                <TrendingUp size={12} className="inline mr-1" />
                Open positions →
              </button>
            )}

            {stopNotice && <p className="term-hint term-hint--ok">{stopNotice}</p>}
          </div>
        )}

        {panelTab === 'lvrg' && (
          <div className="term-panel-stack">
            {!walletReady && (
              <p className="term-hint">Connect wallet to save leverage & risk for the HL bot.</p>
            )}
            <TerminalLvrgPanel
              settings={botSettings.settings}
              walletAddress={wallet}
              hlBalanceUsd={hlFundingUsd}
              disabled={walletReady && hlSetup.loading}
              onSaved={refreshAll}
            />
          </div>
        )}

        {panelTab === 'funds' && (
          <div className="term-panel-stack">
            <div className="term-panel-card term-panel-card--muted">
              <span className="term-panel-card-label">Hyperliquid balance</span>
              <strong className="term-panel-card-value">{fmt(hlFundingUsd)}</strong>
              <span className="term-panel-card-hint">
                Withdrawable {fmt(hlSetup.withdrawableUsd)} · bot needs ${MIN_HL_BOT_USD}+
              </span>
            </div>

            <button
              type="button"
              className="term-btn-sm term-btn-sm--primary w-full justify-center"
              onClick={() => openFunds('deposit')}
            >
              <ArrowDownLeft size={14} />
              Deposit USDC
            </button>

            <button
              type="button"
              className="term-btn-sm w-full justify-center"
              disabled={walletReady && hlSetup.withdrawableUsd <= 0}
              onClick={() =>
                requireAccount('Sign in before withdrawing.', () => openFunds('withdraw'))
              }
            >
              <ArrowUpRight size={14} />
              Withdraw USDC
            </button>

            <p className="term-hint">
              Non-custodial: USDC stays on your Hyperliquid account. Deposit from Arbitrum in
              Monadier — no hyperliquid.xyz needed. Withdraw anytime with your wallet; the bot agent
              cannot withdraw. While a trade is open, withdrawable balance may be lower (margin in
              use).
            </p>
          </div>
        )}
      </div>

      <div className="term-trade-footer">
        <div className="term-field-row">
          <span>HL balance</span>
          <strong>{hlSetup.loading ? '—' : fmt(hlFundingUsd)}</strong>
        </div>
        <div className="term-field-row">
          <span>Total P/L</span>
          <strong className={metrics.totalPnlUsd >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'}>
            {metrics.isLoading ? '—' : fmt(metrics.totalPnlUsd)}
          </strong>
        </div>
        <div className="term-field-row">
          <span>Open</span>
          <strong>{metrics.openPositionsCount}</strong>
        </div>
      </div>

      {showFundsModal && (
        <ProTradeDepositModal
          onClose={() => setShowFundsModal(false)}
          withdrawable={hlSetup.withdrawableUsd.toFixed(2)}
          hlBalanceUsd={hlFundingUsd}
          initialTab={fundsModalTab}
          onSuccess={() => {
            if (fundsModalTab === 'withdraw') setShowFundsModal(false);
            if (!isDemoUser && address) {
              void linkWallet(address);
            }
            refreshAll();
            if (fundsModalTab === 'deposit') {
              void hlSetup.pollBalanceAfterDeposit();
            }
          }}
        />
      )}
      {showSettings && (
        <TerminalBotSettingsModal
          setupPhase={phase}
          minHlUsd={MIN_HL_BOT_USD}
          settings={botSettings.settings}
          walletAddress={wallet}
          startMode={startMode}
          onClose={() => {
            setShowSettings(false);
            setStartMode(false);
          }}
          onSuccess={() => {
            setShowSettings(false);
            setStartMode(false);
            refreshAll();
          }}
        />
      )}
      {showSetupGuide && walletReady && (
        <HlBotSetupGuideModal
          walletReady={walletReady}
          hlBalanceUsd={hlFundingUsd}
          agentApproved={hlSetup.agentApproved}
          builderFeeApproved={hlSetup.builderFeeApproved}
          builderFeeEnabled={hlSetup.builderFeeEnabled}
          botRunning={botRunning}
          currentStep={sidebarStatus.setupStep}
          onClose={() => setShowSetupGuide(false)}
        />
      )}
    </aside>
  );
};

export default TerminalTradePanel;
