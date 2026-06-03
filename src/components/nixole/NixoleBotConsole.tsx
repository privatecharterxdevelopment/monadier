import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Play, Square, Settings, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAppKit } from '@reown/appkit/react';
import { useAuth, DEMO_WALLET_ADDRESS } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import VaultDepositModal from '../vault/VaultDepositModal';
import VaultSettingsModal from '../vault/VaultSettingsModal';
import VaultWithdrawModal from '../vault/VaultWithdrawModal';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';

type Props = {
  metrics: Dashboard2Metrics;
  onRefresh: () => void;
  vaultAction?: 'deposit' | 'withdraw' | null;
  onVaultActionHandled?: () => void;
};

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const NixoleBotConsole: React.FC<Props> = ({
  metrics,
  onRefresh,
  vaultAction,
  onVaultActionHandled,
}) => {
  const { open } = useAppKit();
  const { isConnected, address } = useWeb3();
  const { isDemoUser } = useAuth();

  const [riskPct, setRiskPct] = useState(5);
  const [takeProfit, setTakeProfit] = useState(5);
  const [stopLoss, setStopLoss] = useState(1);
  const [leverage, setLeverage] = useState(1);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [startMode, setStartMode] = useState(false);

  const wallet = isDemoUser ? DEMO_WALLET_ADDRESS : address;

  useEffect(() => {
    if (vaultAction === 'deposit') {
      setShowDeposit(true);
      onVaultActionHandled?.();
    } else if (vaultAction === 'withdraw') {
      setShowWithdraw(true);
      onVaultActionHandled?.();
    }
  }, [vaultAction, onVaultActionHandled]);

  useEffect(() => {
    if (!wallet) return;
    supabase
      .from('vault_settings')
      .select('risk_level_bps, take_profit_percent, stop_loss_percent, leverage_multiplier')
      .eq('wallet_address', wallet.toLowerCase())
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRiskPct((data.risk_level_bps ?? 500) / 100);
          setTakeProfit(Number(data.take_profit_percent ?? 5));
          setStopLoss(Number(data.stop_loss_percent ?? 1));
          setLeverage(Number(data.leverage_multiplier ?? 1));
        }
      });
  }, [wallet, metrics.autoTradeEnabled]);

  if (!isConnected) {
    return (
      <div className="nix-bot-panel items-center justify-center text-center">
        <Bot size={32} className="opacity-60 mb-3" />
        <p className="text-sm text-white/80 mb-4">Connect wallet to run the trading bot</p>
        <button type="button" className="nix-bot-btn nix-bot-btn--primary w-full" onClick={() => open()}>
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="nix-bot-panel">
        <div className="flex items-center justify-between">
          <h3>Bot console</h3>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full ${
              metrics.autoTradeEnabled ? 'bg-green-500/25 text-green-300' : 'bg-white/10 text-white/60'
            }`}
          >
            {metrics.autoTradeEnabled ? 'Live' : 'Stopped'}
          </span>
        </div>

        <div className="nix-bot-grid">
          <div className="nix-bot-stat">
            <span>Risk</span>
            <strong>{riskPct}%</strong>
          </div>
          <div className="nix-bot-stat">
            <span>Leverage</span>
            <strong>{leverage}x</strong>
          </div>
          <div className="nix-bot-stat">
            <span>Take profit</span>
            <strong>+{takeProfit}%</strong>
          </div>
          <div className="nix-bot-stat">
            <span>Stop loss</span>
            <strong>-{stopLoss}%</strong>
          </div>
        </div>

        <div className="text-xs text-white/55 space-y-1 pt-1">
          <div className="flex justify-between">
            <span>Vault</span>
            <strong className="text-white">{metrics.isLoading ? '—' : fmt(metrics.vaultUsd)}</strong>
          </div>
          <div className="flex justify-between">
            <span>Total P/L</span>
            <strong className={metrics.totalPnlUsd >= 0 ? 'text-green-300' : 'text-red-300'}>
              {metrics.isLoading ? '—' : fmt(metrics.totalPnlUsd)}
            </strong>
          </div>
        </div>

        <div className="nix-bot-actions">
          {metrics.autoTradeEnabled ? (
            <button
              type="button"
              className="nix-bot-btn nix-bot-btn--secondary col-span-2"
              onClick={() => {
                setStartMode(false);
                setShowSettings(true);
              }}
            >
              <Square size={14} />
              Stop / settings
            </button>
          ) : (
            <button
              type="button"
              className="nix-bot-btn nix-bot-btn--primary"
              onClick={() => {
                setStartMode(true);
                setShowSettings(true);
              }}
            >
              <Play size={14} />
              Start bot
            </button>
          )}
          <button
            type="button"
            className="nix-bot-btn nix-bot-btn--secondary"
            onClick={() => {
              setStartMode(false);
              setShowSettings(true);
            }}
          >
            <Settings size={14} />
            Settings
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="nix-bot-btn nix-bot-btn--secondary"
            onClick={() => setShowDeposit(true)}
          >
            <ArrowDownLeft size={14} />
            Deposit
          </button>
          <button
            type="button"
            className="nix-bot-btn nix-bot-btn--secondary"
            onClick={() => setShowWithdraw(true)}
          >
            <ArrowUpRight size={14} />
            Withdraw
          </button>
        </div>

        <Link to="/dashboard/bot-trading" className="text-center text-[11px] text-white/50 hover:text-white/80">
          Full positions &amp; history →
        </Link>
      </div>

      {showDeposit && (
        <VaultDepositModal
          onClose={() => setShowDeposit(false)}
          onSuccess={() => {
            setShowDeposit(false);
            onRefresh();
          }}
        />
      )}
      {showWithdraw && wallet && (
        <VaultWithdrawModal
          maxAmount={metrics.vaultUsd.toFixed(2)}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => {
            setShowWithdraw(false);
            onRefresh();
          }}
        />
      )}
      {showSettings && wallet && (
        <VaultSettingsModal
          currentRiskLevel={riskPct}
          autoTradeEnabled={metrics.autoTradeEnabled}
          currentTakeProfit={takeProfit}
          currentStopLoss={stopLoss}
          currentLeverage={leverage}
          startMode={startMode}
          onClose={() => setShowSettings(false)}
          onSuccess={() => {
            setShowSettings(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
};

export default NixoleBotConsole;
