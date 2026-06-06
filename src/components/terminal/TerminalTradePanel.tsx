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
import { supabase } from '../../lib/supabase';
import { VaultClient, VAULT_CHAIN_ID } from '../../lib/vault';
import {
  findOpenPositionId,
  markAllOpenPositionsClosing,
  markPositionClosing,
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

const TerminalTradePanel: React.FC<Props> = ({
  metrics,
  onRefresh,
  onOpenHistory,
  vaultAction,
  onVaultActionHandled,
}) => {
  const { open } = useAppKit();
  const { isConnected, address, chainId, publicClient, walletClient, switchChain } = useWeb3();
  const { isDemoUser } = useAuth();
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
      setBotError('Switch to Arbitrum (ARB) in the header.');
      return false;
    }
  };

  const openDeposit = () => {
    setBotError(null);
    if (!walletReady) {
      open();
      return;
    }
    setShowDeposit(true);
  };

  const openWithdraw = () => {
    setBotError(null);
    if (!walletReady) {
      open();
      return;
    }
    setShowWithdraw(true);
  };

  const handleStartBot = async () => {
    if (phase !== 'ready' || !vault.wallet) return;
    setBotError(null);
    if (!(await ensureArbitrum())) return;
    if (!isDemoUser && (!publicClient || !walletClient)) {
      setStartMode(true);
      setShowSettings(true);
      return;
    }

    setBotBusy(true);
    try {
      if (!isDemoUser && publicClient && walletClient) {
        const client = new VaultClient(publicClient as never, walletClient as never, VAULT_CHAIN_ID);
        await client.setAutoTrade(true, vault.wallet);
      }
      await supabaseUpsertAuto(true);
      refreshAll();
    } catch {
      setStartMode(true);
      setShowSettings(true);
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
    if (!vault.wallet) return;
    await supabase.from('vault_settings').upsert(
      {
        wallet_address: vault.wallet.toLowerCase(),
        chain_id: VAULT_CHAIN_ID,
        auto_trade_enabled: enabled,
      },
      { onConflict: 'wallet_address,chain_id' }
    );
  }

  const handleClosePosition = async () => {
    const pos = vault.position;
    if (!pos?.isActive || !vault.wallet) return;
    setCloseError(null);
    setCloseBusy(true);
    try {
      const tokenSym = pos.token === 'ETH' ? 'WETH' : 'WBTC';
      const dbId = await findOpenPositionId(vault.wallet, tokenSym);
      if (dbId) {
        await markPositionClosing(dbId);
        refreshAll();
        return;
      }

      if (!publicClient || !walletClient) {
        setCloseError('Connect wallet to close on-chain');
        return;
      }
      const client = new VaultClient(publicClient as never, walletClient as never, VAULT_CHAIN_ID);
      const token = pos.token === 'ETH' ? WETH : WBTC;
      try {
        const hash = await client.userInstantClose(token, vault.wallet);
        await publicClient.waitForTransactionReceipt({ hash });
      } catch {
        const hash = await client.reconcilePosition(token, vault.wallet);
        await publicClient.waitForTransactionReceipt({ hash });
      }
      refreshAll();
    } catch (e: unknown) {
      setCloseError(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setCloseBusy(false);
    }
  };

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
        {!walletReady && panelTab !== 'bot' && (
          <p className="term-hint">Connect wallet to use {panelTab === 'lvrg' ? 'LVRG' : 'Funds'}.</p>
        )}

        {panelTab === 'bot' && (
          <div className="term-panel-stack">
            {!walletReady && (
              <button
                type="button"
                className="term-btn-sm term-btn-sm--primary w-full justify-center"
                onClick={() => open()}
              >
                <Wallet size={14} />
                Connect wallet
              </button>
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

            {walletReady && phase !== 'connect' && phase !== 'loading' && (
              <>
                <div className="term-panel-card term-panel-card--muted">
                  <span className="term-panel-card-label">Auto-trading</span>
                  <strong
                    className={`term-panel-card-value ${metrics.autoTradeEnabled ? 'term-pnl-pos' : ''}`}
                  >
                    {metrics.autoTradeEnabled ? 'Running' : 'Stopped'}
                  </strong>
                  <span className="term-panel-card-hint">Vault bot · Arbitrum</span>
                </div>

                <TerminalBotSettingsStrip
                  settings={vault.settings}
                  disabled={!walletReady || phase === 'network'}
                  onAdjust={() => setPanelTab('lvrg')}
                />

                {vault.position?.isActive && (
                  <div className="term-panel-card term-panel-card--position">
                    <span className="term-panel-card-label">Open position</span>
                    <strong className="term-panel-card-value term-panel-card-value--sm">
                      {vault.position.isLong ? 'Long' : 'Short'} {vault.position.token} ·{' '}
                      {vault.position.leverage}x
                    </strong>
                    <span className="term-panel-card-hint">
                      ${parseFloat(vault.position.collateral).toFixed(2)} collateral · entry $
                      {vault.position.entryPrice}
                      {vault.position.pnl != null && (
                        <>
                          {' '}
                          ·{' '}
                          <span
                            className={
                              vault.position.pnl >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'
                            }
                          >
                            {vault.position.pnl >= 0 ? '+' : ''}$
                            {vault.position.pnl.toFixed(2)} P/L
                          </span>
                        </>
                      )}
                    </span>
                    {closeError && (
                      <div className="term-panel-alert">
                        <AlertTriangle size={14} />
                        <span>{closeError}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="term-btn-sm w-full justify-center mt-2"
                      disabled={closeBusy}
                      onClick={handleClosePosition}
                    >
                      {closeBusy ? <Loader2 size={14} className="animate-spin" /> : 'Close position'}
                    </button>
                  </div>
                )}

                {botError && (
                  <div className="term-panel-alert">
                    <AlertTriangle size={14} />
                    <span>{botError}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  {metrics.autoTradeEnabled ? (
                    <button
                      type="button"
                      className="term-btn-sm term-btn-sm--primary flex-1 justify-center"
                      disabled={botBusy || phase !== 'ready'}
                      onClick={handleStopBot}
                    >
                      {botBusy ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                      Stop bot
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="term-btn-sm term-btn-sm--primary flex-1 justify-center"
                      disabled={botBusy || phase !== 'ready'}
                      onClick={handleStartBot}
                    >
                      {botBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      Start bot
                    </button>
                  )}
                </div>

                {phase === 'fund' && (
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
                    Open positions & history →
                  </button>
                )}

                {stopNotice && <p className="term-hint term-hint--ok">{stopNotice}</p>}
              </>
            )}
          </div>
        )}

        {panelTab === 'lvrg' && (
          <div className="term-panel-stack">
            {!walletReady ? (
              <button
                type="button"
                className="term-btn-sm term-btn-sm--primary w-full justify-center"
                onClick={() => open()}
              >
                <Wallet size={14} />
                Connect wallet
              </button>
            ) : phase === 'network' ? (
              <button
                type="button"
                className="term-btn-sm w-full justify-center"
                onClick={() => void ensureArbitrum()}
              >
                Switch to Arbitrum
              </button>
            ) : (
              <TerminalLvrgPanel
                settings={vault.settings}
                vaultUsd={vault.vaultUsd}
                maxTradeUsd={vault.maxTradeUsd}
                disabled={!vault.onArbitrum || vault.isLoading}
                onSaved={refreshAll}
                onOpenAdvanced={() => {
                  setStartMode(false);
                  setShowSettings(true);
                }}
              />
            )}
          </div>
        )}

        {panelTab === 'funds' && (
          <div className="term-panel-stack">
            {walletReady && !vault.onArbitrum && <TerminalArbitrumBanner variant="inline" />}
            <div className="term-panel-card term-panel-card--muted">
              <span className="term-panel-card-label">Vault balance</span>
              <strong className="term-panel-card-value">{fmt(vault.vaultUsd)}</strong>
              <span className="term-panel-card-hint">USDC · withdrawable · Vault V11</span>
            </div>
            <p className="term-hint">
              Min ${MIN_VAULT_USD} for bot trading. Deposit fee free · 10% win fee on profits only.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="term-btn-sm flex-1 justify-center"
                disabled={!walletReady}
                onClick={openDeposit}
              >
                <ArrowDownLeft size={14} />
                Deposit
              </button>
              <button
                type="button"
                className="term-btn-sm flex-1 justify-center"
                disabled={!walletReady || vault.vaultUsd <= 0}
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
          onSuccess={() => {
            setShowDeposit(false);
            refreshAll();
          }}
        />
      )}
      {showWithdraw && walletReady && (
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
      )}
      {showSettings && (
        <TerminalBotSettingsModal
          setupPhase={phase}
          minVaultUsd={MIN_VAULT_USD}
          currentRiskLevel={vault.settings.riskPct}
          autoTradeEnabled={metrics.autoTradeEnabled}
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
