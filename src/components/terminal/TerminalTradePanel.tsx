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
  AlertTriangle,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
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
import {
  approveHlBuilderFeeRequired,
  completeHlBotApprovals,
  verifyHlBuilderFeeOnChain,
} from '../../lib/hyperliquid/hlBotApprovals';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { getHlBuilderConfig } from '../../lib/hyperliquid/builderConfig';
import {
  hlBotSuccessFeeApprovalHint,
  hlBotSuccessFeeStepButtonLabel,
} from '../../lib/hyperliquid/hlBotSuccessFee';
import { useHlBotRunning } from '../../hooks/useHlBotRunning';
import { notifyHlBotRunningChange } from '../../lib/hlBotRunningStore';
import { useBotRuntimeTimer } from '../../hooks/useBotRuntimeTimer';
import { clearBotRuntimeTimer, markBotRuntimeStarted, readBotRuntimeStartMs } from '../../lib/botRuntimeTimer';
import {
  isHlBotReadyToRun,
  isHlBuilderFeeGateSatisfied,
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
import BotSettingsStopFirstModal from './BotSettingsStopFirstModal';
import { effectiveHlBotSettings } from '../../lib/hlBotEffectiveSettings';
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
import { useLegalAcceptance } from '../../contexts/LegalAcceptanceContext';
import { BRAND_NAME } from '../../lib/brand';
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
  const { open } = useMonadierAppKit();
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
  const botSuccessFeeLabel = hlBotSuccessFeeStepButtonLabel(2);
  const platformFees = usePlatformFeeGate();
  const [showFundsModal, setShowFundsModal] = useState(false);
  const [fundsModalTab, setFundsModalTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [showSettings, setShowSettings] = useState(false);
  const [startMode, setStartMode] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [stopNotice, setStopNotice] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [showStopFirstModal, setShowStopFirstModal] = useState(false);

  const { ensureAccepted } = useLegalAcceptance();
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

  const hlFundingUsd = hlSetup.hlLoaded
    ? Math.max(hlSetup.perpUsd, hlSetup.accountUsd)
    : metrics.hasHlSnapshot
      ? metrics.hlBalanceUsd
      : 0;
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
    if (!hlSetup.setupSettled && hlSetup.loading && hlPerpUsd === 0 && hlSpotUsd === 0) {
      return 'loading';
    }
    if (hlSetup.setupSettled) return hlSetup.phase;
    if (hlSetup.loading && hlPerpUsd === 0 && hlSpotUsd === 0) return 'loading';
    return hlSetup.phase;
  }, [
    walletReady,
    hlSetup.setupSettled,
    hlSetup.loading,
    hlSetup.phase,
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
    if (!hlSetup.setupSettled && hlSetup.loading && hlPerpUsd === 0 && hlSpotUsd === 0) {
      return 'Loading Hyperliquid balance…';
    }
    if (hlNeedsSpotTransfer) return null;
    if (hlSetup.setupSettled && hlPerpUsd < MIN_HL_BOT_USD && hlFundingUsd < MIN_HL_BOT_USD) {
      return `Deposit at least $${MIN_HL_BOT_USD} USDC on Hyperliquid to start the bot.`;
    }
    if (!isDemoUser && !isAuthenticated) return `Sign in to ${BRAND_NAME}, then press Start bot.`;
    return null;
  }, [
    walletReady,
    hlSetup.setupSettled,
    hlSetup.loading,
    hlPerpUsd,
    hlFundingUsd,
    hlNeedsSpotTransfer,
    isDemoUser,
    isAuthenticated,
  ]);

  const needsAgentApproval = walletReady && hlSetup.setupSettled && !hlSetup.agentApproved;
  const needsBuilderFeeApproval =
    walletReady &&
    hlSetup.setupSettled &&
    hlSetup.builderFeeEnabled &&
    !hlSetup.builderFeeApproved;
  const canApproveBuilderFee = needsBuilderFeeApproval && hlSetup.builderPlatformReady;

  const approvalsComplete =
    hlSetup.agentApproved &&
    isHlBuilderFeeGateSatisfied(
      hlSetup.builderFeeEnabled,
      hlSetup.builderFeeApproved,
      hlSetup.builderPlatformReady
    );

  const canStartBot =
    !botRunning &&
    !startBlocker &&
    approvalsComplete &&
    (phase === 'ready' || (phase === 'fund' && hlNeedsSpotTransfer));

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
      return `This wallet is linked to another ${BRAND_NAME} account. Sign in with that account or use a different wallet.`;
    }
    if (/builder has insufficient balance|Monadier platform fee is not active/i.test(msg)) {
      return '';
    }
    if (/409|duplicate key|user_wallets/i.test(msg)) {
      return 'Could not link wallet — refresh the page and try Start bot again.';
    }
    return sanitizeUserFacingError(msg) || 'Could not start bot — try again.';
  };

  const persistBotRunning = async (autoTradeEnabled: boolean) => {
    if (!wallet) throw new Error('Connect your wallet first.');
    const s = botSettings.settings;
    if (autoTradeEnabled) {
      if (!hlSetup.agentApproved) {
        throw new Error('Approve the trading agent before starting the bot.');
      }
      if (
        hlSetup.builderFeeEnabled &&
        !(await verifyHlBuilderFeeOnChain(wallet))
      ) {
        throw new Error(
          'Approve the platform fee on Hyperliquid before starting the bot.'
        );
      }
      if (
        !isHlBotReadyToRun(
          hlPerpUsd,
          hlSetup.agentApproved,
          hlSetup.builderFeeApproved,
          hlSetup.builderPlatformReady,
          hlSetup.builderFeeEnabled
        )
      ) {
        throw new Error(
          'Deposit USDC on Perps, approve agent and platform fee, then press Start bot.'
        );
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

  const runApproveAgent = async () => {
    if (!wallet || !address || !walletClient) {
      setBotError('Connect and unlock your wallet first.');
      return;
    }
    setBotError(null);
    setBotBusy(true);
    try {
      // Agent + platform fee in one flow — two wallet signatures, no per-close prompts.
      await completeHlBotApprovals({
        walletClient,
        walletAddress: address,
        userId: user?.id,
      });
      await hlSetup.refresh();
    } catch (err: unknown) {
      setBotError(parseBotTxError(err));
    } finally {
      setBotBusy(false);
    }
  };

  const runApproveBuilderFee = async () => {
    if (!wallet || !address || !walletClient) {
      setBotError('Connect and unlock your wallet first.');
      return;
    }
    if (!hlSetup.builderPlatformReady) {
      setBotError('Platform fee is activating — try again in a minute.');
      return;
    }
    setBotError(null);
    setBotBusy(true);
    try {
      await approveHlBuilderFeeRequired(walletClient, address);
      await hlSetup.refresh();
    } catch (err: unknown) {
      setBotError(parseBotTxError(err));
    } finally {
      setBotBusy(false);
    }
  };

  const runStartBot = async () => {
    if (!walletReady) {
      open();
      return;
    }
    if (!wallet || !address) {
      setBotError('Connect your wallet first.');
      return;
    }
    if (!isDemoUser && !isAuthenticated) {
      onRequireSignIn?.(`Sign in to ${BRAND_NAME}, then press Start bot.`);
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
    if (phase !== 'ready' && !(phase === 'fund' && hlNeedsSpotTransfer)) {
      setBotError(startBlocker ?? 'Complete approvals before starting the bot.');
      return;
    }
    if (
      !isHlBuilderFeeGateSatisfied(
        hlSetup.builderFeeEnabled,
        hlSetup.builderFeeApproved,
        hlSetup.builderPlatformReady
      )
    ) {
      setBotError('Approve the platform fee before starting the bot.');
      return;
    }
    if (platformFees.opensBlocked) {
      setBotError(
        `Pay ${fmt(platformFees.accruedUsd)} in platform fees after ${platformFees.successWinCount} winning closes to start the bot.`
      );
      platformFees.openPayModal();
      return;
    }
    if (!hlSetup.agentApproved) {
      setBotError('Approve the trading agent before starting the bot.');
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

      await persistBotRunning(true);
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

  const handleApproveAgent = () => {
    ensureAccepted(() => void runApproveAgent());
  };

  const handleApproveBuilderFee = () => {
    ensureAccepted(() => void runApproveBuilderFee());
  };

  const handleStartBot = () => {
    ensureAccepted(() => void runStartBot());
  };

  const handleStopBot = async () => {
    if (!walletReady || !wallet) {
      open();
      return;
    }
    if (!isDemoUser && !isAuthenticated) {
      onRequireSignIn?.(`Sign in to ${BRAND_NAME}, then press Stop bot.`);
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

  const botEff = effectiveHlBotSettings(botSettings.settings);

  const handleStopForSettings = async () => {
    await handleStopBot();
    setShowStopFirstModal(false);
    openLvrgTab();
  };

  return (
    <aside className="term-trade-panel">
      <div className="term-trade-header">
        <div className="term-trade-header-top">
          <p className="term-trade-title">{BRAND_NAME} bot</p>
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
                  Connect your wallet to set up the {BRAND_NAME} bot.
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
              <>
                <div
                  className={`term-panel-card term-panel-card--muted term-panel-card--compact hl-bot-status-card hl-bot-status-card--${sidebarStatus.tone}`}
                >
                  <span className="term-panel-card-label">Status</span>
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
              </>
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

            <div className="term-bot-action-stack flex flex-col gap-2">
              {walletReady && botRunning ? (
                <button
                  type="button"
                  className="term-btn-sm term-btn-sm--primary w-full justify-center"
                  disabled={botBusy}
                  onClick={() => void handleStopBot()}
                >
                  {botBusy ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                  {botBusy ? 'Stopping…' : 'Stop bot'}
                </button>
              ) : needsAccountSignIn ? (
                <button
                  type="button"
                  className="term-btn-sm term-btn-sm--primary w-full justify-center"
                  onClick={() =>
                    onRequireSignIn?.('Sign in to Monadier, then press Start bot.')
                  }
                >
                  Sign in
                </button>
              ) : !walletReady ? (
                <button
                  type="button"
                  className="term-btn-sm term-btn-sm--primary w-full justify-center"
                  onClick={() => open()}
                >
                  <Wallet size={14} />
                  Connect wallet
                </button>
              ) : (
                <>
                  {needsAgentApproval ? (
                    <button
                      type="button"
                      className="term-btn-sm term-btn-sm--primary w-full justify-center"
                      disabled={botBusy}
                      onClick={() => void handleApproveAgent()}
                    >
                      {botBusy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ShieldCheck size={14} />
                      )}
                      {botBusy ? 'Approving agent…' : '1. Approve trading agent'}
                    </button>
                  ) : null}
                  {needsBuilderFeeApproval ? (
                    <button
                      type="button"
                      className="term-btn-sm term-btn-sm--primary w-full justify-center"
                      disabled={botBusy || !canApproveBuilderFee}
                      title={hlBotSuccessFeeApprovalHint()}
                      onClick={() => void handleApproveBuilderFee()}
                    >
                      {botBusy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ShieldCheck size={14} />
                      )}
                      {botBusy ? 'Approving…' : botSuccessFeeLabel}
                    </button>
                  ) : null}
                  {canStartBot ? (
                    <button
                      type="button"
                      className="term-btn-sm term-btn-sm--primary w-full justify-center"
                      disabled={botBusy}
                      onClick={() => void handleStartBot()}
                    >
                      {botBusy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Play size={14} />
                      )}
                      {botBusy ? 'Starting…' : 'Start bot'}
                    </button>
                  ) : null}
                </>
              )}
            </div>

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

            {walletReady && hlSetup.setupSettled && phase === 'fund' && !botRunning && (
              <button
                type="button"
                className="term-btn-sm term-btn-sm--primary w-full justify-center"
                onClick={() => openFunds('deposit')}
              >
                <ArrowDownLeft size={14} />
                Deposit USDC
              </button>
            )}

            {onOpenHistory && (
              <button type="button" className="term-bot-positions-row" onClick={onOpenHistory}>
                <span>Open positions</span>
                <span className="term-bot-positions-chevron" aria-hidden>
                  ›
                </span>
              </button>
            )}

            {stopNotice && <p className="term-hint term-hint--ok">{stopNotice}</p>}
          </div>
        )}

        {panelTab === 'lvrg' && (
          <div className="term-panel-stack">
            {!walletReady && (
              <p className="term-hint">Connect wallet to save leverage & risk for the {BRAND_NAME} bot.</p>
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
                <div className="term-field-row term-field-row--fee">
                  <span>Bot fees owed</span>
                  <button
                    type="button"
                    className="term-fee-owed-btn"
                    onClick={platformFees.openPayModal}
                  >
                    <strong>{fmt(platformFees.accruedUsd)}</strong>
                    <span className="term-fee-owed-sub">
                      {platformFees.successWinCount}/{platformFees.winsBeforeBlock} win trades
                    </span>
                  </button>
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
              disabled={
                (walletReady && hlSetup.withdrawableUsd <= 0) || platformFees.withdrawBlocked
              }
              onClick={() =>
                requireAccount('Sign in before withdrawing.', () =>
                  platformFees.withdrawBlocked
                    ? platformFees.openPayModal()
                    : openFunds('withdraw')
                )
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
