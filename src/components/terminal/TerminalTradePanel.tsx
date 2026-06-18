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
import ProTradeDepositModal from '../protrade/ProTradeDepositModal';
import { VAULT_CHAIN_ID } from '../../lib/vault';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { useTerminalVaultData } from '../../hooks/useTerminalVaultData';
import TerminalBotSettingsModal from './TerminalBotSettingsModal';
import TerminalLvrgPanel from './TerminalLvrgPanel';
import TerminalBotSettingsStrip from './TerminalBotSettingsStrip';
import TerminalArbitrumBanner from './TerminalArbitrumBanner';

type PanelTab = 'bot' | 'lvrg' | 'funds';

type Props = {
  metrics: Dashboard2Metrics;
  onRefresh: () => void;
  onOpenHistory?: () => void;
  vaultAction?: 'deposit' | 'withdraw' | null;
  onVaultActionHandled?: () => void;
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
  onRequireSignIn,
}) => {
  const { open } = useAppKit();
  const { isConnected, address, chainId, publicClient, walletClient } = useWeb3();
  const { isDemoUser, isAuthenticated } = useAuth();
  const { linkWallet, planTier } = useSubscription();
  const [panelTab, setPanelTab] = useState<PanelTab>('bot');
  const [vaultTick, setVaultTick] = useState(0);
  const vault = useTerminalVaultData(vaultTick);
  const hlSetup = useHlBotSetup(address ?? undefined);
  const [showHlDeposit, setShowHlDeposit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [startMode, setStartMode] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [stopNotice, setStopNotice] = useState<string | null>(null);

  const walletReady = isConnected || isDemoUser;

  const walletOnArbitrum = isDemoUser || chainId === VAULT_CHAIN_ID;
  const hlFundingUsd = hlSetup.accountUsd;
  const botRunning = vault.settings.autoTradeEnabled;

  const phase: SetupPhase = useMemo(() => {
    if (!walletReady) return 'connect';
    if (hlSetup.loading && hlFundingUsd === 0) return 'loading';
    if (!hlSetup.agentApproved) return 'approve';
    if (hlFundingUsd < MIN_HL_BOT_USD) return 'fund';
    return 'ready';
  }, [walletReady, hlSetup.loading, hlSetup.agentApproved, hlFundingUsd]);

  const startBlocker = useMemo((): string | null => {
    if (!walletReady) return null;
    if (hlSetup.loading && hlFundingUsd === 0) return 'Loading Hyperliquid balance…';
    if (!hlSetup.agentApproved) {
      return 'Approve the Monadier trading agent on Hyperliquid first.';
    }
    if (hlFundingUsd < MIN_HL_BOT_USD) {
      return `Need at least $${MIN_HL_BOT_USD} on Hyperliquid (currently ${fmt(hlFundingUsd)}).`;
    }
    if (!isDemoUser && !isAuthenticated) return 'Sign in to Monadier, then start the bot.';
    return null;
  }, [
    walletReady,
    hlSetup.loading,
    hlSetup.agentApproved,
    hlFundingUsd,
    isDemoUser,
    isAuthenticated,
  ]);

  const requireAccount = (reason: string, next: () => void) => {
    if (!isDemoUser && !isAuthenticated) {
      onRequireSignIn?.(reason);
      return;
    }
    next();
  };

  useEffect(() => {
    if (!vaultAction) return;
    if (!isDemoUser && !isAuthenticated) {
      onRequireSignIn?.(
        vaultAction === 'deposit'
          ? 'Sign in before depositing to the vault.'
          : 'Sign in before withdrawing from the vault.'
      );
      onVaultActionHandled?.();
      return;
    }
    if (vaultAction === 'deposit') {
      setShowHlDeposit(true);
      setPanelTab('funds');
    } else if (vaultAction === 'withdraw') {
      setShowHlDeposit(true);
      setPanelTab('funds');
    }
    onVaultActionHandled?.();
  }, [vaultAction, onVaultActionHandled, isDemoUser, isAuthenticated, onRequireSignIn]);

  const refreshAll = () => {
    onRefresh();
    setVaultTick((n) => n + 1);
    void hlSetup.refresh();
  };

  const openHlDeposit = () => {
    setBotError(null);
    if (!walletReady) {
      open();
      return;
    }
    requireAccount('Sign in before depositing to Hyperliquid.', () => setShowHlDeposit(true));
  };

  const parseBotTxError = (err: unknown): string => {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err && 'shortMessage' in err
          ? String((err as { shortMessage: string }).shortMessage)
          : 'Failed to start bot';
    if (msg.includes('User rejected') || msg.includes('denied')) {
      return 'Transaction cancelled in wallet.';
    }
    if (msg.includes('insufficient funds') || msg.includes('gas')) {
      return 'Need a little ETH on Arbitrum for gas — then tap Start bot again.';
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

  const handleStartBot = async () => {
    if (!walletReady) {
      open();
      return;
    }
    if (!vault.wallet) {
      setBotError('Connect your wallet first.');
      return;
    }
    if (startBlocker) {
      setBotError(startBlocker);
      return;
    }
    setBotError(null);
    if (!isDemoUser && (!publicClient || !walletClient)) {
      setBotError('Wallet not ready — unlock your wallet app and try again.');
      return;
    }

    setBotBusy(true);
    try {
      await ensureBotSubscription();
      await persistVaultSettings({
        settings: {
          walletAddress: vault.wallet,
          autoTradeEnabled: true,
          riskPct: vault.settings.riskPct,
          leverage: vault.settings.leverage,
          takeProfit: vault.settings.takeProfit,
          stopLoss: vault.settings.stopLoss,
          askPermission: vault.settings.askPermission,
          minWinRate: vault.settings.minWinRate,
          minTradesForWinRate: vault.settings.minTradesForWinRate,
        },
        planTier,
        publicClient: publicClient ?? null,
        walletClient: walletClient ?? null,
        userAddress: vault.wallet as `0x${string}`,
        isDemoUser,
        syncTradingParams: false,
        syncAutoTrade: false,
      });
      await enableHlBotExecution(vault.wallet);
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
    if (!walletReady) {
      open();
      return;
    }
    if (!vault.wallet) return;
    if (hlFundingUsd < MIN_HL_BOT_USD) return;
    setBotError(null);
    setStopNotice(null);
    setBotBusy(true);
    try {
      await persistVaultSettings({
        settings: {
          walletAddress: vault.wallet,
          autoTradeEnabled: false,
          riskPct: vault.settings.riskPct,
          leverage: vault.settings.leverage,
          takeProfit: vault.settings.takeProfit,
          stopLoss: vault.settings.stopLoss,
          askPermission: vault.settings.askPermission,
          minWinRate: vault.settings.minWinRate,
          minTradesForWinRate: vault.settings.minTradesForWinRate,
        },
        planTier,
        publicClient: publicClient ?? null,
        walletClient: walletClient ?? null,
        userAddress: vault.wallet as `0x${string}`,
        isDemoUser,
        syncAutoTrade: false,
      });
      refreshAll();
      onRefresh();
      setStopNotice('Bot stopped. Open HL positions stay open until TP/SL or manual close.');
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
          <p className="term-trade-title">Trading bot</p>
          <button type="button" className="term-icon-btn" onClick={refreshAll} title="Refresh">
            <RefreshCw size={14} className={metrics.isLoading || hlSetup.loading ? 'animate-spin' : ''} />
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
            {!walletReady && (
              <div className="term-panel-card term-panel-card--muted term-connect-banner">
                <p className="term-hint term-connect-banner-text">
                  Explore bot settings below. Connect wallet to start trading.
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
            )}

            {walletReady && phase === 'loading' && (
              <div className="term-loading-block">
                <Loader2 size={18} className="animate-spin" />
                <span>Loading Hyperliquid…</span>
              </div>
            )}

            {walletReady && phase === 'approve' && (
              <div className="term-panel-card term-panel-card--muted">
                <span className="term-panel-card-label">Trading agent</span>
                <strong className="term-panel-card-value">Approval required</strong>
                <span className="term-panel-card-hint">
                  One-time Hyperliquid signature. The agent can trade only — not withdraw.
                </span>
                <button
                  type="button"
                  className="term-btn-sm term-btn-sm--primary w-full justify-center mt-2"
                  disabled={approveBusy}
                  onClick={() => void handleApproveAgent()}
                >
                  {approveBusy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={14} />
                  )}
                  Approve agent
                </button>
              </div>
            )}

            <div className="term-panel-card term-panel-card--muted">
              <span className="term-panel-card-label">Auto-trading</span>
              <strong
                className={`term-panel-card-value ${walletReady && botRunning ? 'term-pnl-pos' : ''}`}
              >
                {walletReady && botRunning ? 'Running' : 'Stopped'}
              </strong>
              <span className="term-panel-card-hint">Hyperliquid · cross margin</span>
            </div>

            {walletReady && hlSetup.agentApproved && (
              <div className="term-panel-card term-panel-card--muted">
                <span className="term-panel-card-label">HL balance</span>
                <strong className="term-panel-card-value">{fmt(hlFundingUsd)}</strong>
                <span className="term-panel-card-hint">
                  Withdrawable {fmt(hlSetup.withdrawableUsd)}
                </span>
              </div>
            )}

            <TerminalBotSettingsStrip
              settings={vault.settings}
              disabled={walletReady && hlSetup.loading}
              onAdjust={() => setPanelTab('lvrg')}
            />

            {botError && (
              <div className="term-panel-alert">
                <AlertTriangle size={14} />
                <span>{botError}</span>
              </div>
            )}

            {startBlocker && !botError && (
              <p className="term-hint term-hint--warn">{startBlocker}</p>
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
                  disabled={botBusy}
                  onClick={() => void handleStartBot()}
                >
                  {botBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {botBusy
                    ? 'Confirm in wallet…'
                    : walletReady
                      ? 'Start bot'
                      : 'Connect to start bot'}
                </button>
              )}
            </div>

            {walletReady && phase === 'fund' && (
              <button
                type="button"
                className="term-btn-sm term-btn-sm--ghost w-full justify-center"
                onClick={openHlDeposit}
              >
                <ArrowDownLeft size={14} />
                Deposit to Hyperliquid
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
              <p className="term-hint">
                Adjust leverage & risk below. Connect wallet to save settings.
              </p>
            )}
            <TerminalLvrgPanel
              settings={vault.settings}
              walletAddress={vault.wallet}
              vaultUsd={hlFundingUsd}
              maxTradeUsd={vault.maxTradeUsd}
              riskPctOnChain={vault.riskPctOnChain}
              chainMaxLeverage={vault.chainMaxLeverage}
              disabled={walletReady && hlSetup.loading}
              onSaved={refreshAll}
            />
          </div>
        )}

        {panelTab === 'funds' && (
          <div className="term-panel-stack">
            {walletReady && !walletOnArbitrum && <TerminalArbitrumBanner variant="inline" />}
            <div className="term-panel-card term-panel-card--muted">
              <span className="term-panel-card-label">Hyperliquid balance</span>
              <strong className="term-panel-card-value">{fmt(hlFundingUsd)}</strong>
              <span className="term-panel-card-hint">
                Withdrawable {fmt(hlSetup.withdrawableUsd)} · min ${MIN_HL_BOT_USD} to run bot
              </span>
            </div>
            <p className="term-hint">
              Bridge USDC from Arbitrum to Hyperliquid. The bot trades perps on HL — no GMX vault
              required.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="term-btn-sm flex-1 justify-center"
                onClick={openHlDeposit}
              >
                <ArrowDownLeft size={14} />
                Deposit
              </button>
              <button
                type="button"
                className="term-btn-sm flex-1 justify-center"
                disabled={walletReady && hlSetup.withdrawableUsd <= 0}
                onClick={() => {
                  requireAccount('Sign in before withdrawing from Hyperliquid.', () =>
                    setShowHlDeposit(true)
                  );
                }}
              >
                <ArrowUpRight size={14} />
                Withdraw
              </button>
            </div>
            {vault.balanceUsd > 0 && (
              <p className="term-hint term-hint--warn">
                Legacy GMX vault: {fmt(vault.balanceUsd)} still on Arbitrum — withdraw via old vault
                if needed.
              </p>
            )}
            <button
              type="button"
              className="term-btn-sm term-btn-sm--ghost w-full justify-center"
              onClick={() => {
                setStartMode(false);
                setShowSettings(true);
              }}
            >
              <Settings size={14} />
              All bot settings
            </button>
          </div>
        )}
      </div>

      <div className="term-trade-footer">
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

      {showHlDeposit && (
        <ProTradeDepositModal
          onClose={() => setShowHlDeposit(false)}
          withdrawable={hlSetup.withdrawableUsd.toFixed(2)}
          initialTab={vaultAction === 'withdraw' ? 'withdraw' : 'deposit'}
          onSuccess={() => {
            setShowHlDeposit(false);
            if (!isDemoUser && address) {
              void linkWallet(address);
            }
            refreshAll();
          }}
        />
      )}
      {showSettings && (
        <TerminalBotSettingsModal
          setupPhase={phase === 'approve' ? 'fund' : phase === 'ready' ? 'ready' : phase}
          minVaultUsd={MIN_HL_BOT_USD}
          settings={vault.settings}
          walletAddress={vault.wallet}
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
