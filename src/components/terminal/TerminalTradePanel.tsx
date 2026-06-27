import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  disableHlBotExecution,
  enableHlBotExecution,
  MIN_HL_BOT_USD,
} from '../../lib/hyperliquid/hlBotAgent';
import { registerWalletsForHistory } from '../../lib/userWallets';
import { completeHlBotApprovals } from '../../lib/hyperliquid/hlBotApprovals';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { getHlBuilderConfig } from '../../lib/hyperliquid/builderConfig';
import { useHlBotRunning } from '../../hooks/useHlBotRunning';
import { notifyHlBotRunningChange } from '../../lib/hlBotRunningStore';
import { useBotRuntimeTimer } from '../../hooks/useBotRuntimeTimer';
import { clearBotRuntimeTimer, markBotRuntimeStarted, readBotRuntimeStartMs } from '../../lib/botRuntimeTimer';
import {
  isHlBotReadyToRun,
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
import TerminalBotModeRow from './TerminalBotModeRow';
import BotSettingsStopFirstModal from './BotSettingsStopFirstModal';
import { sanitizeUserFacingError } from '../../lib/hyperliquid/builderPlatform';
import { isBotScanNoiseDetail } from '../../lib/hlBotReasonLabels';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { hlWalletExplorerUrl } from '../../lib/hyperliquid/hlApp';
import {
  needsSpotToPerpTransfer,
  pollHlPerpAfterTransfer,
  spotToPerpTransferAmount,
} from '../../lib/hyperliquid/funding';
import { useBettingUi } from '../../contexts/BettingUiContext';
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
  /** Pro Trade app — one shared HL funds modal in the page header shell. */
  useGlobalFundsModal?: boolean;
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
  useGlobalFundsModal = false,
}) => {
  const { open } = useAppKit();
  const { isConnected, address, publicClient, walletClient } = useWeb3();
  const { address: monadierAddress } = useMonadierWallet();
  const { transferUsdClass } = useHyperliquidTrading();
  const { isDemoUser, isAuthenticated, user } = useAuth();
  const { linkWallet, planTier } = useSubscription();
  const [panelTab, setPanelTab] = useState<PanelTab>('bot');
  const {
    botRunning,
    settings: botSettingsSnapshot,
    settingsLoading: botSettingsLoading,
    wallet: botWallet,
    bumpSettings,
  } = useHlBotRunning({
    metricsAutoTrade: metrics.autoTradeEnabled,
    metricsHasSnapshot: metrics.hasHlSnapshot,
  });
  const botSettings = {
    settings: botSettingsSnapshot,
    isLoading: botSettingsLoading,
    wallet: botWallet,
  };
  const hlBalanceWallet = monadierAddress ?? address ?? botWallet ?? undefined;
  const hlSetup = useHlBotSetup(hlBalanceWallet);
  const builderConfig = getHlBuilderConfig();
  const [showFundsModal, setShowFundsModal] = useState(false);
  const [fundsModalTab, setFundsModalTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [showSettings, setShowSettings] = useState(false);
  const [startMode, setStartMode] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [stopNotice, setStopNotice] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [showStopFirstModal, setShowStopFirstModal] = useState(false);

  const { openFunds: openGlobalFunds } = useBettingUi();
  const walletReady = isDemoUser || isConnected || Boolean(monadierAddress);
  const wallet = botSettings.wallet;
  const accountSignedIn = isDemoUser || isAuthenticated;
  const needsAccountSignIn = walletReady && !accountSignedIn;

  const onboardingKey = useMemo(
    () => hlBotOnboardingStorageKey(user?.id, wallet ?? address ?? null),
    [user?.id, wallet, address]
  );
  const [setupGuideComplete, setSetupGuideComplete] = useState(() =>
    readHlBotOnboardingComplete(onboardingKey)
  );

  const hlFundingUsd = metrics.hasHlSnapshot ? metrics.hlBalanceUsd : hlSetup.accountUsd;
  const hlPerpUsd = hlSetup.perpUsd;
  const hlSpotUsd = hlSetup.spotUsdcUsd;
  const hlUnifiedAccount = hlSetup.unifiedAccount;
  const hlNeedsSpotTransfer = needsSpotToPerpTransfer(
    hlSetup.rawPerpUsd,
    hlSpotUsd,
    MIN_HL_BOT_USD,
    hlUnifiedAccount
  );
  const autoTradeDb = botSettings.settings.autoTradeEnabled;

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
  const timerWallet = wallet ?? address ?? undefined;
  const botRuntime = useBotRuntimeTimer(timerWallet, Boolean(walletReady && botRunning));

  useEffect(() => {
    if (!botRunning || !timerWallet) return;
    if (readBotRuntimeStartMs(timerWallet) == null) {
      markBotRuntimeStarted(timerWallet);
    }
  }, [botRunning, timerWallet]);


  const hasOpenPosition = metrics.openPositionsCount > 0;
  const marginLockedUsd = hasOpenPosition
    ? Math.max(0, hlSetup.totalMarginUsedUsd)
    : 0;

  const phase: SetupPhase = useMemo(() => {
    if (!walletReady) return 'connect';
    if (hlSetup.loading && hlPerpUsd === 0 && hlSpotUsd === 0) return 'loading';
    if (hlSetup.phase !== 'connect') return hlSetup.phase;
    if (hlPerpUsd < MIN_HL_BOT_USD) return 'fund';
    if (!hlSetup.agentApproved || (hlSetup.builderFeeEnabled && hlSetup.builderPlatformReady && !hlSetup.builderFeeApproved)) {
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
    hlPerpUsd,
    hlSpotUsd,
  ]);

  const sidebarStatus = useMemo(
    () =>
      getHlBotSidebarStatus({
        walletReady,
        accountSignedIn,
        phase,
        botRunning,
        hlBalanceUsd: hlFundingUsd,
        perpUsd: hlPerpUsd,
        spotUsdcUsd: hlSpotUsd,
        unifiedAccount: hlUnifiedAccount,
        agentApproved: hlSetup.agentApproved,
        builderFeeApproved: hlSetup.builderFeeApproved,
        builderFeeEnabled: hlSetup.builderFeeEnabled,
        builderPlatformReady: hlSetup.builderPlatformReady,
        runtimeLabel: botRuntime.formatted || (botRunning ? '0s' : undefined),
      }),
    [
      walletReady,
      accountSignedIn,
      phase,
      botRunning,
      hlFundingUsd,
      hlPerpUsd,
      hlSpotUsd,
      hlUnifiedAccount,
      hlSetup.agentApproved,
      hlSetup.builderFeeApproved,
      hlSetup.builderFeeEnabled,
      botRuntime.formatted,
    ]
  );

  const startBlocker = useMemo((): string | null => {
    if (!walletReady) return null;
    if (hlSetup.loading && hlPerpUsd === 0 && hlSpotUsd === 0) {
      return 'Loading Hyperliquid balance…';
    }
    if (hlNeedsSpotTransfer) return null;
    if (hlPerpUsd < MIN_HL_BOT_USD && hlFundingUsd < MIN_HL_BOT_USD) {
      return `Deposit at least $${MIN_HL_BOT_USD} USDC on Hyperliquid to start the bot.`;
    }
    if (!isDemoUser && !isAuthenticated) return 'Sign in to Monadier, then press Start bot.';
    return null;
  }, [
    walletReady,
    hlSetup.loading,
    hlPerpUsd,
    hlSpotUsd,
    hlFundingUsd,
    hlNeedsSpotTransfer,
    isDemoUser,
    isAuthenticated,
  ]);

  const needsHlApproval =
    !hlSetup.agentApproved ||
    (hlSetup.builderFeeEnabled && hlSetup.builderPlatformReady && !hlSetup.builderFeeApproved);

  const canStartBot =
    !botRunning &&
    (phase === 'ready' || phase === 'approve' || (phase === 'fund' && hlNeedsSpotTransfer)) &&
    !startBlocker;

  const requireAccount = (reason: string, next: () => void) => {
    if (!isDemoUser && !isAuthenticated) {
      onRequireSignIn?.(reason);
      return;
    }
    next();
  };

  const openFunds = (tab: 'deposit' | 'withdraw') => {
    if (useGlobalFundsModal) {
      openGlobalFunds(tab);
      return;
    }
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
    bumpSettings();
    void hlSetup.refresh();
  };

  const openLvrgTab = () => setPanelTab('lvrg');

  const requestLvrgAccess = () => {
    openLvrgTab();
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
      return 'No USDC detected on Hyperliquid yet — deposit first (min $20), then approve the agent.';
    }
    if (/insufficient funds/i.test(msg) && /gas/i.test(msg)) {
      return 'Not enough ETH on Arbitrum for gas — add a little ETH to your wallet. Your Hyperliquid USDC is separate.';
    }
    if (/insufficient funds/i.test(msg)) {
      return 'Wallet rejected the request — if you have USDC on Hyperliquid, this is usually a trading permission signature, not a balance issue. Try again or check HL balance in the Funds tab.';
    }
    if (/extra agent already used|agent already/i.test(msg)) {
      return 'This API wallet is already registered on Hyperliquid. If you approved before, refresh the page — otherwise revoke an old API key at app.hyperliquid.xyz → More → API.';
    }
    if (/linked to another/i.test(msg)) {
      return 'This wallet is linked to another Monadier account. Sign in with that account or use a different wallet.';
    }
    if (/builder has insufficient balance|Monadier platform fee is not active/i.test(msg)) {
      return '';
    }
    if (/409|duplicate key|user_wallets/i.test(msg)) {
      return 'Could not link wallet — refresh the page and try Start bot again.';
    }
    return sanitizeUserFacingError(msg) || 'Could not start bot — try again.';
  };

  const persistBotRunning = async (
    autoTradeEnabled: boolean,
    ready?: { agentApproved: boolean; builderFeeApproved: boolean }
  ) => {
    if (!wallet) throw new Error('Connect your wallet first.');
    const s = botSettings.settings;
    const agentOk = ready?.agentApproved ?? hlSetup.agentApproved;
    if (autoTradeEnabled) {
      const builderPlatformReady = hlSetup.builderPlatformReady;
      const builderOk =
        !hlSetup.builderFeeEnabled ||
        !builderPlatformReady ||
        (ready?.builderFeeApproved ?? hlSetup.builderFeeApproved);
      if (!isHlBotReadyToRun(hlPerpUsd, agentOk, builderOk, builderPlatformReady)) {
        throw new Error('Deposit USDC on Perps, approve the trading agent, then press Start bot again.');
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
    if (hlPerpUsd < MIN_HL_BOT_USD && !hlNeedsSpotTransfer && hlFundingUsd < MIN_HL_BOT_USD) {
      setBotError(`Deposit at least $${MIN_HL_BOT_USD} USDC on Hyperliquid to start the bot.`);
      return;
    }
    if (phase !== 'ready' && phase !== 'approve' && !(phase === 'fund' && hlNeedsSpotTransfer)) {
      setBotError(startBlocker ?? 'Complete setup before starting the bot.');
      return;
    }
    setBotError(null);
    if (!isDemoUser && (!publicClient || !walletClient)) {
      setBotError('Wallet not ready — unlock your wallet and try again.');
      return;
    }

    setBotBusy(true);
    notifyHlBotRunningChange(true);
    try {
      if (hlNeedsSpotTransfer) {
        const move = spotToPerpTransferAmount(hlSpotUsd);
        if (move) {
          await transferUsdClass(move, true);
          const snap = await pollHlPerpAfterTransfer(wallet, { minPerpUsd: MIN_HL_BOT_USD });
          await hlSetup.refresh();
          if (snap.tradablePerpUsd < MIN_HL_BOT_USD) {
            throw new Error('Could not move USDC to Perps — try Funds → Transfer Spot → Perps.');
          }
        }
      }

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

      await persistBotRunning(true, { agentApproved, builderFeeApproved });
      markBotRuntimeStarted(timerWallet ?? wallet);
      if (!readHlBotOnboardingComplete(onboardingKey)) {
        writeHlBotOnboardingComplete(onboardingKey);
        setSetupGuideComplete(true);
        fireProfileOnboardingConfetti();
      }
      refreshAll();
    } catch (err: unknown) {
      notifyHlBotRunningChange(false);
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
    notifyHlBotRunningChange(false);
    try {
      await persistBotRunning(false);
      clearBotRuntimeTimer(timerWallet ?? wallet);
      refreshAll();
      onRefresh();
      setStopNotice(
        'Bot stopped — no new trades. Open positions stay protected (TP / SL / profit lock). Stop is instant on Hyperliquid (no MetaMask).'
      );
    } catch (e: unknown) {
      notifyHlBotRunningChange(true);
      setBotError(e instanceof Error ? e.message : 'Failed to stop bot');
    } finally {
      setBotBusy(false);
    }
  };

  const handleStopForSettings = async () => {
    await handleStopBot();
    setShowStopFirstModal(false);
    openLvrgTab();
  };

  return (
    <aside className="term-trade-panel">
      <div className="term-trade-header">
        <div className="term-trade-header-top">
          <p className="term-trade-title">Monadier bot</p>
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
                className={metrics.isLoading && !metrics.hasHlSnapshot ? 'animate-spin' : ''}
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
            onClick={() => (t.id === 'lvrg' ? requestLvrgAccess() : setPanelTab(t.id))}
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
                  Connect your wallet to set up the Monadier bot.
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
                {sidebarStatus.detail && !isBotScanNoiseDetail(sidebarStatus.detail) ? (
                  <p className="hl-bot-status-detail">{sidebarStatus.detail}</p>
                ) : null}
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

            <TerminalBotModeRow
              settings={botSettings.settings}
              walletAddress={wallet}
              disabled={!walletReady || botSettings.isLoading}
              botRunning={botRunning}
              onBlockedChange={() => setShowStopFirstModal(true)}
              onSaved={refreshAll}
            />

            <TerminalBotSettingsStrip
              settings={botSettings.settings}
              disabled={walletReady && hlSetup.loading}
              onAdjust={requestLvrgAccess}
            />

            {botError && (
              <div className="term-panel-alert">
                <AlertTriangle size={14} />
                <span>{botError}</span>
              </div>
            )}

            {walletReady && phase === 'fund' && !botRunning && (
              <div className="term-panel-info">
                <AlertTriangle size={14} />
                <span>
                  {hlNeedsSpotTransfer
                    ? `${fmt(hlSpotUsd)} on HL Spot — deposit moves to Perps automatically on standard HL accounts.`
                    : `Deposit min. $${MIN_HL_BOT_USD} USDC on Hyperliquid — Arbitrum native USDC only (not BNB or other chains).`}
                </span>
              </div>
            )}

            {walletReady &&
              hlPerpUsd >= MIN_HL_BOT_USD &&
              needsHlApproval &&
              !botRunning &&
              !botError && (
                <div className="term-panel-info">
                  <Info size={14} />
                  <span>
                    HL balance {fmt(hlPerpUsd)} is sufficient. MetaMask will ask to{' '}
                    <strong>allow trading</strong> — not to withdraw your USDC. A generic
                    &quot;assets at risk&quot; warning is normal for API approvals.
                  </span>
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
              ) : needsAccountSignIn ? (
                <button
                  type="button"
                  className="term-btn-sm term-btn-sm--primary flex-1 justify-center"
                  onClick={() =>
                    onRequireSignIn?.('Sign in to Monadier, then press Start bot.')
                  }
                >
                  Sign in
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
              <p className="term-hint">Connect wallet to save leverage & risk for the Monadier bot.</p>
            )}
            <TerminalLvrgPanel
              settings={botSettings.settings}
              walletAddress={wallet}
              hlBalanceUsd={hlFundingUsd}
              disabled={walletReady && hlSetup.loading}
              botRunning={botRunning}
              onBlockedSave={() => setShowStopFirstModal(true)}
              onSaved={refreshAll}
            />
          </div>
        )}

        {panelTab === 'funds' && (
          <div className="term-panel-stack">
            <div className="term-panel-card term-panel-card--muted">
              <span className="term-panel-card-label">Hyperliquid account</span>
              {hlBalanceWallet ? (
                <a
                  className="term-hint hl-funds-wallet-link"
                  href={hlWalletExplorerUrl(hlBalanceWallet)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {hlBalanceWallet.slice(0, 6)}…{hlBalanceWallet.slice(-4)} on HypurrScan
                </a>
              ) : null}
              <div className="term-funds-breakdown">
                <div className="term-field-row">
                  <span>{hlUnifiedAccount ? 'Trading balance' : 'Total balance'}</span>
                  <strong>{fmt(hlPerpUsd)}</strong>
                </div>
                {!hlUnifiedAccount ? (
                  <>
                    <div className="term-field-row term-field-row--hint">
                      <span>Perps</span>
                      <strong>{fmt(hlSetup.rawPerpUsd)}</strong>
                    </div>
                    <div className="term-field-row term-field-row--hint">
                      <span>Spot USDC</span>
                      <strong>{fmt(hlSpotUsd)}</strong>
                    </div>
                  </>
                ) : null}
                <div className="term-field-row">
                  <span>Withdrawable</span>
                  <strong>{fmt(metrics.hlWithdrawableUsd)}</strong>
                </div>
                {hasOpenPosition && marginLockedUsd > 0.01 ? (
                  <div className="term-field-row term-field-row--hint">
                    <span>Margin in open trade</span>
                    <strong>{fmt(marginLockedUsd)}</strong>
                  </div>
                ) : null}
              </div>
              <span className="term-panel-card-hint">
                {hlUnifiedAccount
                  ? 'Unified Hyperliquid account — spot and perps share one USDC balance. Deposit once, then Start bot.'
                  : hlNeedsSpotTransfer
                    ? `${fmt(hlSpotUsd)} on HL Spot — standard accounts auto-move to Perps after deposit.`
                    : `Bot needs $${MIN_HL_BOT_USD}+ USDC on Hyperliquid. Withdrawable is lower while a position is open.`}
              </span>
            </div>

            <button
              type="button"
              className="term-btn-sm term-btn-sm--primary w-full justify-center"
              onClick={() =>
                requireAccount('Sign in before depositing to Hyperliquid.', () =>
                  openFunds('deposit')
                )
              }
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
              Non-custodial: USDC stays on Hyperliquid. Deposit only <strong>native USDC on Arbitrum</strong>{' '}
              (not BNB/BSC or other networks). Withdraw anytime with your wallet; the bot agent cannot
              withdraw. While a trade is open, withdrawable balance may be lower (margin in use).
            </p>
          </div>
        )}
      </div>

      <div className="term-trade-footer term-trade-footer--stable">
        <div className="term-field-row">
          <span>HL balance</span>
          <strong>{fmt(metrics.hlBalanceUsd)}</strong>
        </div>
        <div className="term-field-row">
          <span>Withdrawable</span>
          <strong>{fmt(metrics.hlWithdrawableUsd)}</strong>
        </div>
        {hasOpenPosition && marginLockedUsd > 0.01 ? (
          <div className="term-field-row term-field-row--hint">
            <span>Margin locked</span>
            <strong>{fmt(marginLockedUsd)}</strong>
          </div>
        ) : null}
        <div className="term-field-row">
          <span>uPnL</span>
          <strong
            className={
              metrics.unrealizedPnlUsd >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'
            }
          >
            {`${metrics.unrealizedPnlUsd >= 0 ? '+' : ''}${fmt(metrics.unrealizedPnlUsd)}`}
          </strong>
        </div>
        <div className="term-field-row">
          <span>Total P/L</span>
          <strong
            className={
              metrics.totalPnlUsd >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'
            }
          >
            {fmt(metrics.totalPnlUsd)}
          </strong>
        </div>
        <div className="term-field-row">
          <span>Open</span>
          <strong>{metrics.openPositionsCount}</strong>
        </div>
      </div>

      {showFundsModal && !useGlobalFundsModal ? (
        <ProTradeDepositModal
          onClose={() => setShowFundsModal(false)}
          withdrawable={hlSetup.withdrawableUsd.toFixed(2)}
          hlBalanceUsd={hlFundingUsd}
          spotUsdc={hlSpotUsd}
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
      ) : null}
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
      {showStopFirstModal && (
        <BotSettingsStopFirstModal
          open={showStopFirstModal}
          onClose={() => setShowStopFirstModal(false)}
          onStopBot={() => void handleStopForSettings()}
          stopBusy={botBusy}
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
