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
} from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { supabase } from '../../lib/supabase';
import { VaultClient, VAULT_CHAIN_ID, getArbitrumPublicClient } from '../../lib/vault';
import {
  markAllOpenPositionsClosing,
} from '../../lib/positionClose';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { useTerminalVaultData } from '../../hooks/useTerminalVaultData';
import TerminalDepositModal from './TerminalDepositModal';
import TerminalWithdrawModal from './TerminalWithdrawModal';
import TerminalBotSettingsModal from './TerminalBotSettingsModal';
import TerminalLvrgPanel from './TerminalLvrgPanel';
import TerminalBotSettingsStrip from './TerminalBotSettingsStrip';
import TerminalArbitrumBanner from './TerminalArbitrumBanner';

const MIN_VAULT_USD = 50;

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

type SetupPhase = 'connect' | 'loading' | 'network' | 'fund' | 'ready';

const TerminalTradePanel: React.FC<Props> = ({
  metrics,
  onRefresh,
  onOpenHistory,
  vaultAction,
  onVaultActionHandled,
  onRequireSignIn,
}) => {
  const { open } = useAppKit();
  const { isConnected, address, chainId, publicClient, walletClient, switchChain } = useWeb3();
  const { isDemoUser, isAuthenticated } = useAuth();
  const { linkWallet } = useSubscription();
  const [panelTab, setPanelTab] = useState<PanelTab>('bot');
  const [vaultTick, setVaultTick] = useState(0);
  const vault = useTerminalVaultData(vaultTick);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [startMode, setStartMode] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [stopNotice, setStopNotice] = useState<string | null>(null);

  const walletReady = isConnected || isDemoUser;

  const walletOnArbitrum = isDemoUser || chainId === VAULT_CHAIN_ID;
  const vaultFundingUsd = Math.max(vault.balanceUsd, vault.vaultUsd, metrics.vaultUsd);
  const botRunning = vault.settings.autoTradeEnabled;

  const startBlocker = useMemo((): string | null => {
    if (!walletReady) return null;
    if (vault.isLoading && vaultFundingUsd === 0) return 'Loading vault balance…';
    if (vaultFundingUsd < MIN_VAULT_USD) {
      return `Need at least $${MIN_VAULT_USD} in vault (currently ${fmt(vaultFundingUsd)}).`;
    }
    if (!walletOnArbitrum) return 'Switch your wallet to Arbitrum (ARB), then try again.';
    if (!isDemoUser && !isAuthenticated) return 'Sign in to Monadier, then start the bot.';
    return null;
  }, [
    walletReady,
    vault.isLoading,
    vaultFundingUsd,
    walletOnArbitrum,
    isDemoUser,
    isAuthenticated,
  ]);

  const phase: SetupPhase = useMemo(() => {
    if (!walletReady) return 'connect';
    if (vault.isLoading && vaultFundingUsd === 0) return 'loading';
    if (!walletOnArbitrum) return 'network';
    if (vaultFundingUsd < MIN_VAULT_USD) return 'fund';
    return 'ready';
  }, [walletReady, vault.isLoading, walletOnArbitrum, vaultFundingUsd]);

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
      setShowDeposit(true);
      setPanelTab('funds');
    } else if (vaultAction === 'withdraw') {
      setShowWithdraw(true);
      setPanelTab('funds');
    }
    onVaultActionHandled?.();
  }, [vaultAction, onVaultActionHandled, isDemoUser, isAuthenticated, onRequireSignIn]);

  const refreshAll = () => {
    onRefresh();
    setVaultTick((n) => n + 1);
  };

  const ensureArbitrum = async () => {
    if (isDemoUser || walletOnArbitrum) return true;
    try {
      await switchChain(VAULT_CHAIN_ID);
      refreshAll();
      return true;
    } catch {
      setBotError('Switch to Arbitrum (ARB) in your wallet.');
      return false;
    }
  };

  const openDeposit = () => {
    setBotError(null);
    if (!walletReady) {
      open();
      return;
    }
    requireAccount(
      'Sign in before depositing — vault funds must link to your Monadier account.',
      () => setShowDeposit(true)
    );
  };

  const openWithdraw = () => {
    setBotError(null);
    if (!walletReady) {
      open();
      return;
    }
    requireAccount('Sign in before withdrawing from the vault.', () => setShowWithdraw(true));
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
    if (!(await ensureArbitrum())) return;
    if (!isDemoUser && (!publicClient || !walletClient)) {
      setBotError('Wallet not ready — unlock your wallet app and try again.');
      return;
    }

    setBotBusy(true);
    try {
      const arbClient = getArbitrumPublicClient();
      if (!isDemoUser && walletClient) {
        const client = new VaultClient(arbClient as never, walletClient as never, VAULT_CHAIN_ID);
        const hash = await client.setAutoTrade(true, vault.wallet);
        await arbClient.waitForTransactionReceipt({ hash });
      }
      await supabaseUpsertAuto(true);
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
    if (vaultFundingUsd < MIN_VAULT_USD) return;
    setBotError(null);
    setStopNotice(null);
    if (!(await ensureArbitrum())) return;
    setBotBusy(true);
    try {
      if (!isDemoUser && publicClient && walletClient) {
        const client = new VaultClient(publicClient as never, walletClient as never, VAULT_CHAIN_ID);
        const hash = await client.emergencyStop(vault.wallet);
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await supabaseUpsertAuto(false);
      const closingCount = await markAllOpenPositionsClosing(vault.wallet, 'bot_stopped');
      refreshAll();
      onRefresh();
      if (closingCount > 0) {
        setStopNotice(
          `Bot stopped. Closing ${closingCount} open position${closingCount === 1 ? '' : 's'}…`
        );
      }
    } catch (e: unknown) {
      setBotError(e instanceof Error ? e.message : 'Failed to stop bot');
    } finally {
      setBotBusy(false);
    }
  };

  async function supabaseUpsertAuto(enabled: boolean) {
    if (!vault.wallet) throw new Error('No wallet connected');
    const { error } = await supabase.from('vault_settings').upsert(
      {
        wallet_address: vault.wallet.toLowerCase(),
        chain_id: VAULT_CHAIN_ID,
        auto_trade_enabled: enabled,
      },
      { onConflict: 'wallet_address,chain_id' }
    );
    if (error) throw new Error(error.message);
  }

  return (
    <aside className="term-trade-panel">
      <div className="term-trade-header">
        <div className="term-trade-header-top">
          <p className="term-trade-title">Trading bot</p>
          <button type="button" className="term-icon-btn" onClick={refreshAll} title="Refresh">
            <RefreshCw size={14} className={metrics.isLoading || vault.isLoading ? 'animate-spin' : ''} />
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
                <span>Loading vault…</span>
              </div>
            )}

            {walletReady && phase === 'network' && (
              <button
                type="button"
                className="term-btn-sm w-full justify-center"
                onClick={() => void ensureArbitrum()}
              >
                Switch to Arbitrum
              </button>
            )}

            <div className="term-panel-card term-panel-card--muted">
              <span className="term-panel-card-label">Auto-trading</span>
              <strong
                className={`term-panel-card-value ${walletReady && botRunning ? 'term-pnl-pos' : ''}`}
              >
                {walletReady && botRunning ? 'Running' : 'Stopped'}
              </strong>
              <span className="term-panel-card-hint">Vault bot · Arbitrum</span>
            </div>

            <TerminalBotSettingsStrip
              settings={vault.settings}
              disabled={walletReady && !walletOnArbitrum}
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
                onClick={openDeposit}
              >
                <ArrowDownLeft size={14} />
                Deposit to fund vault
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
                Adjust leverage & risk below. Connect wallet to save on-chain.
              </p>
            )}
            {walletReady && phase === 'network' && (
              <button
                type="button"
                className="term-btn-sm w-full justify-center"
                onClick={() => void ensureArbitrum()}
              >
                Switch to Arbitrum
              </button>
            )}
            <TerminalLvrgPanel
              settings={vault.settings}
              vaultUsd={vaultFundingUsd}
              maxTradeUsd={vault.maxTradeUsd}
              disabled={walletReady && vault.isLoading}
              onSaved={refreshAll}
              onOpenAdvanced={() => {
                setStartMode(false);
                setShowSettings(true);
              }}
            />
          </div>
        )}

        {panelTab === 'funds' && (
          <div className="term-panel-stack">
            {walletReady && !walletOnArbitrum && <TerminalArbitrumBanner variant="inline" />}
            <div className="term-panel-card term-panel-card--muted">
              <span className="term-panel-card-label">Vault balance (on-chain)</span>
              <strong className="term-panel-card-value">{fmt(vault.balanceUsd)}</strong>
              <span className="term-panel-card-hint">
                Withdrawable now {fmt(vault.vaultUsd)}
                {vault.balanceUsd > vault.vaultUsd + 0.01 &&
                  ' · tap Withdraw → Withdraw all to clear remaining USDC'}
              </span>
            </div>
            {vault.balanceUsd > 0 && vault.balanceUsd < MIN_VAULT_USD && (
              <p className="term-hint term-hint--warn">
                {fmt(vault.balanceUsd)} still in the vault — use Withdraw → &quot;Withdraw all (full
                vault balance)&quot; to move it back to your wallet.
              </p>
            )}
            <p className="term-hint">
              Min ${MIN_VAULT_USD} to run the bot. Deposit fee 0.1% (~$0.05 per $52) leaves your wallet
              on deposit — it does not stay in the vault. Win fee 10% on profits only.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="term-btn-sm flex-1 justify-center"
                onClick={openDeposit}
              >
                <ArrowDownLeft size={14} />
                Deposit
              </button>
              <button
                type="button"
                className="term-btn-sm flex-1 justify-center"
                disabled={walletReady && vault.balanceUsd <= 0 && vault.vaultUsd <= 0}
                onClick={openWithdraw}
              >
                <ArrowUpRight size={14} />
                Withdraw
              </button>
            </div>
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

      {showDeposit && (
        <TerminalDepositModal
          onClose={() => setShowDeposit(false)}
          onRequireSignIn={onRequireSignIn}
          onSuccess={() => {
            setShowDeposit(false);
            if (!isDemoUser && address) {
              void linkWallet(address);
            }
            refreshAll();
          }}
        />
      )}
      {showWithdraw && walletReady && (
        <TerminalWithdrawModal
          maxAmount={vault.vaultUsdExact}
          balanceAmount={vault.balanceExact}
          hasActivePosition={Boolean(vault.position?.isActive)}
          onClose={() => setShowWithdraw(false)}
          onRequireSignIn={onRequireSignIn}
          onSuccess={() => {
            setShowWithdraw(false);
            refreshAll();
          }}
        />
      )}
      {showSettings && (
        <TerminalBotSettingsModal
          setupPhase={phase}
          minVaultUsd={MIN_VAULT_USD}
          currentRiskLevel={vault.settings.riskPct}
          autoTradeEnabled={botRunning}
          currentTakeProfit={vault.settings.takeProfit}
          currentStopLoss={vault.settings.stopLoss}
          currentLeverage={vault.settings.leverage}
          currentAskPermission={vault.settings.askPermission}
          currentMinWinRate={vault.settings.minWinRate}
          currentMinTradesForWinRate={vault.settings.minTradesForWinRate}
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
