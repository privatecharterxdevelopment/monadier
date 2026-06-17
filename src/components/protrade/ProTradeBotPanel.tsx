import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Play,
  RefreshCw,
  Settings,
  Square,
  Wallet,
} from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAuth } from '../../contexts/AuthContext';
import { markAllOpenPositionsClosing } from '../../lib/positionClose';
import {
  closeMethodMessage,
  executeVaultPositionClose,
} from '../../lib/vaultPositionClose';
import { persistVaultSettings } from '../../lib/syncVaultSettings';
import { ensureBotSubscription } from '../../lib/ensureBotSubscription';
import { useSubscription } from '../../contexts/SubscriptionContext';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { VAULT_CHAIN_ID } from '../../lib/vault';
import { useTerminalVaultData } from '../../hooks/useTerminalVaultData';
import TerminalDepositModal from '../terminal/TerminalDepositModal';
import TerminalWithdrawModal from '../terminal/TerminalWithdrawModal';
import TerminalBotSettingsModal from '../terminal/TerminalBotSettingsModal';
import TerminalLvrgPanel from '../terminal/TerminalLvrgPanel';
import TerminalBotSettingsStrip from '../terminal/TerminalBotSettingsStrip';
import TerminalArbitrumBanner from '../terminal/TerminalArbitrumBanner';

const MIN_VAULT_USD = 50;
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const;
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const;

type PanelTab = 'bot' | 'lvrg' | 'funds';

type Props = {
  metrics: Dashboard2Metrics;
  onRefresh: () => void;
  onOpenHistory?: () => void;
  vaultAction?: 'deposit' | 'withdraw' | null;
  onVaultActionHandled?: () => void;
};

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type SetupPhase = 'connect' | 'loading' | 'network' | 'fund' | 'ready';

const ProTradeBotPanel: React.FC<Props> = ({
  metrics,
  onRefresh,
  onOpenHistory,
  vaultAction,
  onVaultActionHandled,
}) => {
  const { open } = useAppKit();
  const { isConnected, publicClient, walletClient, switchChain } = useWeb3();
  const { isDemoUser } = useAuth();
  const { planTier, linkWallet } = useSubscription();
  const [panelTab, setPanelTab] = useState<PanelTab>('bot');
  const [vaultTick, setVaultTick] = useState(0);
  const vault = useTerminalVaultData(vaultTick);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [startMode, setStartMode] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [stopNotice, setStopNotice] = useState<string | null>(null);

  const walletReady = isConnected || isDemoUser;

  const phase: SetupPhase = useMemo(() => {
    if (!walletReady) return 'connect';
    if (metrics.isLoading || vault.isLoading) return 'loading';
    if (!vault.onArbitrum) return 'network';
    if (vault.vaultUsd < MIN_VAULT_USD) return 'fund';
    return 'ready';
  }, [walletReady, metrics.isLoading, vault.isLoading, vault.onArbitrum, vault.vaultUsd]);

  useEffect(() => {
    if (vaultAction === 'deposit') {
      setShowDeposit(true);
      setPanelTab('funds');
      onVaultActionHandled?.();
    } else if (vaultAction === 'withdraw') {
      setShowWithdraw(true);
      setPanelTab('funds');
      onVaultActionHandled?.();
    }
  }, [vaultAction, onVaultActionHandled]);

  const refreshAll = () => {
    onRefresh();
    setVaultTick((n) => n + 1);
  };

  const ensureArbitrum = async () => {
    if (isDemoUser || vault.onArbitrum) return true;
    try {
      await switchChain(VAULT_CHAIN_ID);
      refreshAll();
      return true;
    } catch {
      setBotError('Switch to Arbitrum (ARB) in your wallet.');
      return false;
    }
  };

  async function startBotTrading() {
    if (!vault.wallet) throw new Error('No wallet connected');
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
      syncTradingParams: !isDemoUser && Boolean(publicClient && walletClient),
      syncAutoTrade: !isDemoUser && Boolean(publicClient && walletClient),
    });
    if (!isDemoUser) {
      await linkWallet(vault.wallet);
    }
  }

  async function stopBotTrading() {
    if (!vault.wallet) return;
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
      syncAutoTrade: !isDemoUser && Boolean(publicClient && walletClient),
    });
  }

  const handleStartBot = async () => {
    if (phase !== 'ready' || !vault.wallet) return;
    setBotError(null);
    if (!(await ensureArbitrum())) return;
    if (!isDemoUser && (!publicClient || !walletClient)) {
      setBotError('Wallet nicht bereit — in MetaMask entsperren.');
      return;
    }

    setBotBusy(true);
    try {
      await startBotTrading();
      refreshAll();
    } catch (e: unknown) {
      setBotError(e instanceof Error ? e.message : 'Bot konnte nicht gestartet werden');
    } finally {
      setBotBusy(false);
    }
  };

  const handleStopBot = async () => {
    if (!vault.wallet || phase !== 'ready') return;
    setBotError(null);
    setStopNotice(null);
    if (!(await ensureArbitrum())) return;
    setBotBusy(true);
    try {
      await stopBotTrading();
      const closingCount = await markAllOpenPositionsClosing(vault.wallet, 'bot_stopped');
      refreshAll();
      if (closingCount > 0) {
        setStopNotice(
          `Bot gestoppt. Schließe ${closingCount} offene Position${closingCount === 1 ? '' : 'en'}…`
        );
      }
    } catch (e: unknown) {
      setBotError(e instanceof Error ? e.message : 'Bot konnte nicht gestoppt werden');
    } finally {
      setBotBusy(false);
    }
  };

  const handleClosePosition = async () => {
    const pos = vault.position;
    if (!pos?.isActive || !vault.wallet) return;
    setCloseError(null);
    setCloseBusy(true);
    try {
      const result = await executeVaultPositionClose({
        wallet: vault.wallet,
        token: pos.token,
        publicClient,
        walletClient,
      });
      setCloseError(closeMethodMessage(result));
      refreshAll();
    } catch (e: unknown) {
      setCloseError(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setCloseBusy(false);
    }
  };

  const tabClass = (id: PanelTab) =>
    `hl-entry-preset ${panelTab === id ? 'hl-entry-preset--on' : ''}`;

  return (
    <aside className="hl-order-panel">
      <div className="hl-entry-head">
        <div className="hl-bot-panel-tabs">
          {(
            [
              { id: 'bot' as const, label: 'Bot' },
              { id: 'lvrg' as const, label: 'LVRG' },
              { id: 'funds' as const, label: 'Vault' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              className={tabClass(t.id)}
              onClick={() => setPanelTab(t.id)}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            className="hl-bot-refresh"
            onClick={refreshAll}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw
              size={13}
              className={metrics.isLoading || vault.isLoading ? 'animate-spin' : ''}
            />
          </button>
        </div>
      </div>

      <div className="hl-entry-scroll hl-bot-scope">
        {panelTab === 'bot' && (
          <>
            {!walletReady ? (
              <button type="button" className="hl-entry-submit" onClick={() => open()}>
                <Wallet size={14} style={{ display: 'inline', marginRight: 6 }} />
                Connect wallet
              </button>
            ) : null}

            {walletReady && phase === 'loading' ? (
              <div className="hl-bot-loading">
                <Loader2 size={16} className="animate-spin" />
                <span>Loading GMX vault…</span>
              </div>
            ) : null}

            {walletReady && phase === 'network' ? (
              <button type="button" className="hl-entry-submit" onClick={() => void ensureArbitrum()}>
                Switch to Arbitrum
              </button>
            ) : null}

            {walletReady && phase !== 'connect' && phase !== 'loading' ? (
              <>
                <div className="hl-bot-card">
                  <div className="hl-entry-label">Auto-trading</div>
                  <div
                    className={`hl-bot-card-value ${metrics.autoTradeEnabled ? 'hl-up' : ''}`}
                  >
                    {metrics.autoTradeEnabled ? 'Running' : 'Stopped'}
                  </div>
                  <div className="hl-entry-hint">GMX Vault · Arbitrum</div>
                </div>

                <TerminalBotSettingsStrip
                  settings={vault.settings}
                  disabled={!walletReady || phase === 'network'}
                  onAdjust={() => setPanelTab('lvrg')}
                />

                {vault.position?.isActive ? (
                  <div className="hl-bot-card">
                    <div className="hl-entry-label">Open position</div>
                    <div className="hl-bot-card-value hl-bot-card-value--sm">
                      {vault.position.isLong ? 'Long' : 'Short'} {vault.position.token} ·{' '}
                      {vault.position.leverage}x
                    </div>
                    <div className="hl-entry-hint">
                      ${parseFloat(vault.position.collateral).toFixed(2)} collateral · entry $
                      {vault.position.entryPrice}
                      {vault.position.pnl != null ? (
                        <>
                          {' '}
                          ·{' '}
                          <span className={vault.position.pnl >= 0 ? 'hl-up' : 'hl-down'}>
                            {vault.position.pnl >= 0 ? '+' : ''}$
                            {vault.position.pnl.toFixed(2)} P/L
                          </span>
                        </>
                      ) : null}
                    </div>
                    {closeError ? (
                      <p className="hl-entry-err">
                        <AlertCircle size={12} /> {closeError}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="hl-entry-foot-btn"
                      style={{ width: '100%', marginTop: 8 }}
                      disabled={closeBusy}
                      onClick={handleClosePosition}
                    >
                      {closeBusy ? <Loader2 size={14} className="animate-spin" /> : 'Close position'}
                    </button>
                  </div>
                ) : null}

                {botError ? (
                  <p className="hl-entry-err">
                    <AlertCircle size={12} /> {botError}
                  </p>
                ) : null}

                {metrics.autoTradeEnabled ? (
                  <button
                    type="button"
                    className="hl-entry-submit hl-entry-submit--short"
                    disabled={botBusy || phase !== 'ready'}
                    onClick={handleStopBot}
                  >
                    {botBusy ? <Loader2 size={16} className="animate-spin" /> : <Square size={14} />}
                    Stop bot
                  </button>
                ) : (
                  <button
                    type="button"
                    className="hl-entry-submit"
                    disabled={botBusy || phase !== 'ready'}
                    onClick={handleStartBot}
                  >
                    {botBusy ? <Loader2 size={16} className="animate-spin" /> : <Play size={14} />}
                    Start bot
                  </button>
                )}

                {phase === 'fund' ? (
                  <button
                    type="button"
                    className="hl-entry-foot-btn"
                    style={{ width: '100%' }}
                    onClick={() => setShowDeposit(true)}
                  >
                    <ArrowDownLeft size={12} /> Deposit to fund vault
                  </button>
                ) : null}

                {stopNotice ? <p className="hl-entry-ok">{stopNotice}</p> : null}
              </>
            ) : null}
          </>
        )}

        {panelTab === 'lvrg' && (
          <>
            {!walletReady ? (
              <button type="button" className="hl-entry-submit" onClick={() => open()}>
                <Wallet size={14} style={{ display: 'inline', marginRight: 6 }} />
                Connect wallet
              </button>
            ) : (
              <>
                {walletReady && !vault.onArbitrum ? (
                  <TerminalArbitrumBanner variant="inline" />
                ) : null}
                <TerminalLvrgPanel
                  settings={vault.settings}
                  walletAddress={vault.wallet}
                  vaultUsd={vault.vaultUsd}
                  maxTradeUsd={vault.maxTradeUsd}
                  disabled={vault.isLoading}
                  onSaved={refreshAll}
                />
              </>
            )}
          </>
        )}

        {panelTab === 'funds' && (
          <>
            {walletReady && !vault.onArbitrum ? (
              <TerminalArbitrumBanner variant="inline" />
            ) : null}
            <div className="hl-bot-card">
              <div className="hl-entry-label">Vault balance</div>
              <div className="hl-bot-card-value">{fmt(vault.vaultUsd)}</div>
              <div className="hl-entry-hint">USDC · GMX Vault V11 · Arbitrum</div>
            </div>
            <p className="hl-entry-hint">
              GMX vault on Arbitrum only — not your Hyperliquid balance. Min ${MIN_VAULT_USD} for bot
              trading. Deposit fee free · 10% win fee on profits only.
            </p>
            <div className="hl-bot-funds-row">
              <button
                type="button"
                className="hl-entry-foot-btn"
                disabled={!walletReady}
                onClick={() => setShowDeposit(true)}
              >
                <ArrowDownLeft size={12} /> Deposit
              </button>
              <button
                type="button"
                className="hl-entry-foot-btn"
                disabled={!walletReady || vault.vaultUsd <= 0}
                onClick={() => setShowWithdraw(true)}
              >
                <ArrowUpRight size={12} /> Withdraw
              </button>
            </div>
            <button
              type="button"
              className="hl-entry-foot-btn"
              style={{ width: '100%' }}
              onClick={() => setPanelTab('lvrg')}
            >
              <Settings size={12} /> Bot settings
            </button>
          </>
        )}
      </div>

      <div className="hl-entry-foot hl-bot-foot">
        <div className="hl-bot-foot-row">
          <span>Total P/L</span>
          <strong className={metrics.totalPnlUsd >= 0 ? 'hl-up' : 'hl-down'}>
            {metrics.isLoading ? '—' : fmt(metrics.totalPnlUsd)}
          </strong>
        </div>
        <div className="hl-bot-foot-row">
          <span>Open</span>
          <strong
            className={
              metrics.openPositionsCount > 0
                ? metrics.unrealizedPnlUsd >= 0
                  ? 'hl-up'
                  : 'hl-down'
                : undefined
            }
          >
            {metrics.openPositionsCount}
          </strong>
        </div>
      </div>

      {showDeposit ? (
        <TerminalDepositModal
          onClose={() => setShowDeposit(false)}
          onSuccess={() => {
            setShowDeposit(false);
            refreshAll();
          }}
        />
      ) : null}
      {showWithdraw && walletReady ? (
        <TerminalWithdrawModal
          maxAmount={vault.vaultUsd.toFixed(2)}
          balanceAmount={vault.balanceUsd.toFixed(2)}
          hasActivePosition={Boolean(vault.position?.isActive)}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => {
            setShowWithdraw(false);
            refreshAll();
          }}
        />
      ) : null}
      {showSettings ? (
        <TerminalBotSettingsModal
          setupPhase={phase}
          minVaultUsd={MIN_VAULT_USD}
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
      ) : null}
    </aside>
  );
};

export default ProTradeBotPanel;
