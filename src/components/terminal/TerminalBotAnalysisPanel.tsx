import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  AlertCircle,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { VAULT_CHAIN_ID } from '../../lib/vault';
import { useUnifiedSignal } from '../../hooks/useUnifiedSignal';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import type { VaultSettingsSnapshot } from '../../hooks/useTerminalVaultData';

const ANALYSIS_STEPS = [
  { label: '1m scan', progress: 15 },
  { label: '5m trends', progress: 35 },
  { label: '15m patterns', progress: 55 },
  { label: '1h momentum', progress: 75 },
  { label: 'Signal merge', progress: 95 },
] as const;

const MIN_VAULT_USD = 50;
const MIN_CONFIDENCE = 40;

type DbAnalysis = {
  signal: string;
  confidence: number;
  rsi: number;
  trend: string;
  pattern: string | null;
  recommendation: string;
};

type Props = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  settings: VaultSettingsSnapshot;
  hasOpenPosition: boolean;
};

type GateStatus = 'pass' | 'fail' | 'warn' | 'pending';

type Gate = {
  id: string;
  label: string;
  detail: string;
  status: GateStatus;
};

const TerminalBotAnalysisPanel: React.FC<Props> = ({
  walletConnected,
  metrics,
  settings,
  hasOpenPosition,
}) => {
  const [dbAnalysis, setDbAnalysis] = useState<DbAnalysis | null>(null);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(ANALYSIS_STEPS[0].progress);
  const [winRate, setWinRate] = useState<{ rate: number; closed: number } | null>(null);

  const scanning = metrics.autoTradeEnabled && !hasOpenPosition;

  const { signal, isLoading, error, refresh, isStrong, lastUpdated } = useUnifiedSignal({
    symbol: 'ETHUSDT',
    timeframes: ['1m', '5m', '15m', '1h'],
    refreshInterval: 30000,
    autoRefresh: walletConnected,
  });

  useEffect(() => {
    if (!scanning) {
      setStep(0);
      setProgress(ANALYSIS_STEPS[0].progress);
      return;
    }
    const id = setInterval(() => {
      setStep((prev) => {
        const next = (prev + 1) % ANALYSIS_STEPS.length;
        setProgress(ANALYSIS_STEPS[next].progress);
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, [scanning]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('bot_analysis')
        .select('signal, confidence, rsi, trend, pattern, recommendation, updated_at')
        .eq('chain_id', VAULT_CHAIN_ID)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setDbAnalysis(data as DbAnalysis);
    };
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!walletConnected || settings.minWinRate <= 0) {
      setWinRate(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('positions')
        .select('profit_loss')
        .eq('chain_id', VAULT_CHAIN_ID)
        .eq('status', 'closed')
        .not('profit_loss', 'is', null)
        .order('closed_at', { ascending: false })
        .limit(100);
      if (!data?.length) {
        setWinRate({ rate: 0, closed: 0 });
        return;
      }
      const wins = data.filter((r) => (r.profit_loss as number) > 0).length;
      setWinRate({ rate: (wins / data.length) * 100, closed: data.length });
    })();
  }, [walletConnected, settings.minWinRate]);

  const gates: Gate[] = useMemo(() => {
    const list: Gate[] = [];

    list.push({
      id: 'bot',
      label: 'Bot service API',
      detail: error
        ? 'Offline — deploy bot-service (see docs/BOT_DEPLOY.md)'
        : lastUpdated
          ? `Live · ${lastUpdated.toLocaleTimeString()}`
          : 'Connected',
      status: error ? 'fail' : isLoading ? 'pending' : 'pass',
    });

    list.push({
      id: 'auto',
      label: 'Auto-trading',
      detail: metrics.autoTradeEnabled ? 'Running on Arbitrum' : 'Stopped',
      status: metrics.autoTradeEnabled ? 'pass' : 'warn',
    });

    list.push({
      id: 'vault',
      label: 'Vault balance',
      detail: `$${metrics.vaultUsd.toFixed(2)} (min $${MIN_VAULT_USD})`,
      status: metrics.vaultUsd >= MIN_VAULT_USD ? 'pass' : 'fail',
    });

    list.push({
      id: 'position',
      label: 'Open position slot',
      detail: hasOpenPosition ? '1/1 in use — wait for close' : 'Free — bot may open',
      status: hasOpenPosition ? 'warn' : 'pass',
    });

    if (settings.minWinRate > 0 && winRate) {
      const ok =
        winRate.closed < settings.minTradesForWinRate ||
        winRate.rate >= settings.minWinRate;
      list.push({
        id: 'winrate',
        label: 'Win-rate gate',
        detail:
          winRate.closed < settings.minTradesForWinRate
            ? `${winRate.closed}/${settings.minTradesForWinRate} trades — gate skipped`
            : `${winRate.rate.toFixed(1)}% (min ${settings.minWinRate}%)`,
        status: ok ? 'pass' : 'fail',
      });
    }

    if (signal) {
      list.push({
        id: 'signal',
        label: 'Signal strength',
        detail: `${signal.direction} · ${Math.round(signal.confidence)}% conf. (min ${MIN_CONFIDENCE}%)`,
        status:
          signal.direction !== 'HOLD' && signal.confidence >= MIN_CONFIDENCE
            ? 'pass'
            : 'warn',
      });
    }

    return list;
  }, [
    error,
    hasOpenPosition,
    isLoading,
    lastUpdated,
    metrics.autoTradeEnabled,
    metrics.vaultUsd,
    settings.minWinRate,
    settings.minTradesForWinRate,
    signal,
    winRate,
  ]);

  const action = signal?.direction ?? dbAnalysis?.signal ?? 'HOLD';
  const actionConf = signal?.confidence ?? dbAnalysis?.confidence ?? 0;

  if (!walletConnected) {
    return (
      <div className="term-analysis-panel term-analysis-panel--idle">
        <p className="term-analysis-panel-hint">Connect wallet to see live bot analysis & trade gates.</p>
      </div>
    );
  }

  return (
    <div className="term-analysis-panel">
      <div className="term-analysis-panel-head">
        <div className="term-analysis-panel-title">
          <Activity size={16} className={scanning ? 'term-analysis-pulse' : ''} />
          <span>Bot analysis</span>
          {scanning && (
            <span className="term-analysis-panel-badge">Scanning markets</span>
          )}
        </div>
        <button
          type="button"
          className="term-dock-refresh"
          onClick={() => refresh()}
          aria-label="Refresh analysis"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {scanning && (
        <div className="term-analysis-bar term-analysis-bar--inline">
          <span className="term-analysis-step">{ANALYSIS_STEPS[step].label}</span>
          <div className="term-analysis-track">
            <div className="term-analysis-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="term-analysis-pct">{Math.round(progress)}%</span>
        </div>
      )}

      <div className="term-analysis-panel-grid">
        <section className="term-analysis-panel-block">
          <h3 className="term-analysis-panel-label">
            <Zap size={14} /> Action / signal
          </h3>
          {error && !signal ? (
            <p className="term-analysis-panel-warn">
              <AlertCircle size={14} />
              Bot API unreachable — showing last DB snapshot if available.
            </p>
          ) : null}
          <div
            className={`term-analysis-action term-analysis-action--${action.toLowerCase()}`}
          >
            {action === 'LONG' ? (
              <TrendingUp size={20} />
            ) : action === 'SHORT' ? (
              <TrendingDown size={20} />
            ) : (
              <Minus size={20} />
            )}
            <div>
              <strong>{action}</strong>
              <span>{Math.round(actionConf)}% confidence</span>
            </div>
            {isStrong && <span className="term-analysis-action-tag">Tradeable</span>}
          </div>
          {signal?.reasons && signal.reasons.length > 0 && (
            <ul className="term-analysis-reasons">
              {signal.reasons.slice(0, 4).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {signal?.warnings && signal.warnings.length > 0 && (
            <p className="term-analysis-panel-warn">{signal.warnings[0]}</p>
          )}
          {!signal && dbAnalysis && (
            <p className="term-analysis-panel-meta">
              DB: {dbAnalysis.trend} · RSI {dbAnalysis.rsi}
              {dbAnalysis.pattern ? ` · ${dbAnalysis.pattern}` : ''} —{' '}
              {dbAnalysis.recommendation?.split(' - ')[0]}
            </p>
          )}
          {signal && (
            <div className="term-analysis-tf-row">
              {signal.timeframes.map((tf) => (
                <span
                  key={tf.timeframe}
                  className={`term-analysis-tf-chip term-analysis-tf-chip--${tf.direction.toLowerCase()}`}
                >
                  {tf.timeframe} {tf.direction}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="term-analysis-panel-block">
          <h3 className="term-analysis-panel-label">
            <Shield size={14} /> Security & gates (pre-trade)
          </h3>
          <ul className="term-analysis-gates">
            {gates.map((g) => (
              <li key={g.id} className={`term-analysis-gate term-analysis-gate--${g.status}`}>
                {g.status === 'pass' ? (
                  <ShieldCheck size={14} />
                ) : g.status === 'fail' ? (
                  <ShieldAlert size={14} />
                ) : (
                  <Shield size={14} />
                )}
                <div>
                  <span className="term-analysis-gate-label">{g.label}</span>
                  <span className="term-analysis-gate-detail">{g.detail}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="term-analysis-panel-foot">
            Bot opens only when all gates pass · 5m cooldown after close · max 1 position
          </p>
        </section>
      </div>

      {isLoading && !signal && (
        <div className="term-analysis-panel-loading">
          <Loader2 size={14} className="animate-spin" />
          Loading MTF signal…
        </div>
      )}
    </div>
  );
};

export default TerminalBotAnalysisPanel;
