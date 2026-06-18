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
} from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { persistVaultSettings } from '../../lib/syncVaultSettings';
import { ensureBotSubscription } from '../../lib/ensureBotSubscription';
import {
  approveHlBotAgent,
  enableHlBotExecution,
  fetchHlAgentAddress,
  MIN_HL_BOT_USD,
  saveHlAgentApproval,
} from '../../lib/hyperliquid/hlBotAgent';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { useBotRuntimeTimer } from '../../hooks/useBotRuntimeTimer';
import { useBotServerBlockers } from '../../hooks/useBotServerBlockers';
import { clearBotRuntimeTimer, markBotRuntimeStarted } from '../../lib/botRuntimeTimer';
import { getHlBotSidebarStatus } from '../../lib/hlBotUserStatus';
import HlBotSetupSteps from './HlBotSetupSteps';
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
  const { isDemoUser, isAuthenticated } = useAuth();
  const { linkWallet, planTier } = useSubscription();
  const [panelTab, setPanelTab] = useState<PanelTab>('bot');
  const [settingsTick, setSettingsTick] = useState(0);
  const botSettings = useTerminalBotSettings(settingsTick);
  const hlSetup = useHlBotSetup(address ?? undefined);
  const [showFundsModal, setShowFundsModal] = useState(false);
  const [fundsModalTab, setFundsModalTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [showSettings, setShowSettings] = useState(false);
  const [startMode, setStartMode] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [stopNotice, setStopNotice] = useState<string | null>(null);

  const walletReady = isConnected || isDemoUser;
  const wallet = botSettings.wallet;
  const hlFundingUsd = hlSetup.accountUsd;
  const botRunning = botSettings.settings.autoTradeEnabled;
  const timerWallet = wallet ?? address ?? undefined;
  const botRuntime = useBotRuntimeTimer(timerWallet, Boolean(walletReady && botRunning));
  const serverBlockers = useBotServerBlockers(timerWallet, Boolean(botRunning));
  const hasOpenPosition = metrics.openPositionsCount > 0;

  const phase: SetupPhase = useMemo(() => {
    if (!walletReady) return 'connect';
    if (hlSetup.loading && hlFundingUsd === 0) return 'loading';
    if (hlFundingUsd < MIN_HL_BOT_USD) return 'fund';
    if (!hlSetup.agentApproved) return 'approve';
    return 'ready';
  }, [walletReady, hlSetup.loading, hlSetup.agentApproved, hlFundingUsd]);

  const sidebarStatus = useMemo(
    () =>
      getHlBotSidebarStatus({
        walletReady,
        phase,
        botRunning,
        hlBalanceUsd: hlFundingUsd,
        agentApproved: hlSetup.agentApproved,
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
      hasOpenPosition,
      serverBlockers,
      botRuntime.formatted,
    ]
  );

  const startBlocker = useMemo((): string | null => {
    if (!walletReady) return null;
    if (hlSetup.loading && hlFundingUsd === 0) return 'Loading Hyperliquid balance…';
    if (hlFundingUsd < MIN_HL_BOT_USD) {
      return `Deposit at least $${MIN_HL_BOT_USD} USDC on Hyperliquid first.`;
    }
    if (!hlSetup.agentApproved) {
      return 'Approve the trading agent (one-time).';
    }
    if (!isDemoUser && !isAuthenticated) return 'Sign in to Monadier, then press Start bot.';
    return null;
  }, [
    walletReady,
    hlSetup.loading,
    hlSetup.agentApproved,
    hlFundingUsd,
    isDemoUser,
    isAuthenticated,
  ]);

  const canStartBot = phase === 'ready' && !startBlocker;

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
    return msg;
  };

  const handleApproveAgent = async () => {
    if (!walletReady || !address) {
      open();
      return;
    }
    if (!walletClient) {
      setBotError('Wallet not ready — unlock your wallet and try again.');
      return;
    }
    setBotError(null);
    setApproveBusy(true);
    try {
      const meta = await fetchHlAgentAddress(address);
      if (!meta.success || !meta.agentAddress) {
        throw new Error(meta.error || 'Could not load agent address');
      }
      await approveHlBotAgent(
        walletClient,
        meta.agentAddress as `0x${string}`,
        meta.agentName || 'monadier'
      );
      await saveHlAgentApproval({
        walletAddress: address,
        agentAddress: meta.agentAddress,
        agentName: meta.agentName || 'monadier',
        expiresAt: meta.expiresAt ?? null,
      });
      refreshAll();
    } catch (err: unknown) {
      setBotError(parseBotTxError(err));
    } finally {
      setApproveBusy(false);
    }
  };

  const persistBotRunning = async (autoTradeEnabled: boolean) => {
    if (!wallet) throw new Error('Connect your wallet first.');
    const s = botSettings.settings;
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
    if (autoTradeEnabled) {
      await enableHlBotExecution(wallet);
    }
  };

  const handleStartBot = async () => {
    if (!walletReady) {
      open();
      return;
    }
    if (!wallet) {
      setBotError('Connect your wallet first.');
      return;
    }
    if (!isDemoUser && !isAuthenticated) {
      onRequireSignIn?.('Sign in to Monadier, then press Start bot.');
      return;
    }
    if (startBlocker || phase !== 'ready') {
      setBotError(startBlocker ?? 'Deposit USDC and approve the agent before starting the bot.');
      return;
    }
    setBotError(null);
    if (!isDemoUser && (!publicClient || !walletClient)) {
      setBotError('Wallet not ready — unlock your wallet and try again.');
      return;
    }

    setBotBusy(true);
    try {
      await ensureBotSubscription();
      await persistBotRunning(true);
      markBotRuntimeStarted(timerWallet ?? wallet);
      if (!isDemoUser && address) {
        await linkWallet(address);
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
    setBotError(null);
    setStopNotice(null);
    setBotBusy(true);
    try {
      await persistBotRunning(false);
      clearBotRuntimeTimer(timerWallet ?? wallet);
      refreshAll();
      onRefresh();
      setStopNotice(
        'Bot stopped — no new trades. Open HL positions stay until TP/SL or manual close.'
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
          <button type="button" className="term-icon-btn" onClick={refreshAll} title="Refresh">
            <RefreshCw
              size={14}
              className={metrics.isLoading || hlSetup.loading ? 'animate-spin' : ''}
            />
          </button>
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
              <HlBotSetupSteps
                walletReady={walletReady}
                hlBalanceUsd={hlFundingUsd}
                agentApproved={hlSetup.agentApproved}
                botRunning={botRunning}
                currentStep={sidebarStatus.setupStep}
              />
            )}

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
              {walletReady && (
                <p className="term-panel-card-hint">
                  HL balance {fmt(hlFundingUsd)} · withdrawable {fmt(hlSetup.withdrawableUsd)}
                </p>
              )}
            </div>

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
                Deposit USDC on Hyperliquid
              </button>
            )}

            {walletReady && phase === 'approve' && !botRunning && (
              <button
                type="button"
                className="term-btn-sm term-btn-sm--primary w-full justify-center"
                disabled={approveBusy || hlFundingUsd < MIN_HL_BOT_USD}
                onClick={() => void handleApproveAgent()}
              >
                {approveBusy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ShieldCheck size={14} />
                )}
                Approve trading agent
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
                  Stop bot
                </button>
              ) : (
                <button
                  type="button"
                  className="term-btn-sm term-btn-sm--primary flex-1 justify-center"
                  disabled={botBusy || !walletReady || !canStartBot}
                  title={
                    !canStartBot && startBlocker
                      ? startBlocker
                      : phase === 'fund'
                        ? `Deposit $${MIN_HL_BOT_USD}+ on Hyperliquid first`
                        : phase === 'approve'
                          ? 'Approve the trading agent first'
                          : undefined
                  }
                  onClick={() => void handleStartBot()}
                >
                  {botBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {botBusy ? 'Saving…' : walletReady ? 'Start bot' : 'Connect wallet'}
                </button>
              )}
            </div>

            {walletReady && botRunning && (phase === 'fund' || phase === 'approve') && (
              <button
                type="button"
                className="term-btn-sm term-btn-sm--ghost w-full justify-center"
                onClick={() => {
                  if (phase === 'fund') openFunds('deposit');
                  else void handleApproveAgent();
                }}
              >
                {phase === 'fund' ? (
                  <>
                    <ArrowDownLeft size={14} />
                    Finish setup — deposit USDC
                  </>
                ) : (
                  <>
                    <ShieldCheck size={14} />
                    Finish setup — approve agent
                  </>
                )}
              </button>
            )}

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
              Deposit sends USDC from Arbitrum to your Hyperliquid account — inside Monadier, no
              hyperliquid.xyz visit needed.
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
          setupPhase={phase === 'approve' ? 'fund' : phase === 'ready' ? 'ready' : phase}
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
    </aside>
  );
};

export default TerminalTradePanel;
