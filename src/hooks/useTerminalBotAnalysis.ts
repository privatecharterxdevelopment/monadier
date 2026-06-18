import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { VAULT_CHAIN_ID } from '../lib/vault';
import { useUnifiedSignal } from './useUnifiedSignal';
import { evaluateBotReadiness, readinessFromServerBlockers } from '../lib/botReadiness';
import { getBotApiBase, type Timeframe } from '../lib/signalService';

export const ANALYSIS_STEPS = [
  { label: 'Scanning 1m chart', progress: 15 },
  { label: 'Analyzing 5m trends', progress: 35 },
  { label: 'Checking 15m patterns', progress: 55 },
  { label: 'Evaluating 1h momentum', progress: 75 },
  { label: 'Combining signals', progress: 95 },
] as const;

const MTF_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h'];

type DbAnalysis = {
  signal: string;
  confidence: number;
  rsi: number;
  trend: string;
  pattern: string | null;
  recommendation: string;
};

import type { Dashboard2Metrics } from './useDashboard2Metrics';

type Options = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  hasOpenPosition: boolean;
  vaultUsd?: number;
  /** Connected wallet the bot trades on (0x…) */
  vaultWallet?: string | null;
  symbol?: string;
};

export function useTerminalBotAnalysis({
  walletConnected,
  metrics,
  hasOpenPosition,
  vaultUsd = 0,
  vaultWallet,
  symbol = 'ETHUSDT',
}: Options) {
  const [dbAnalysis, setDbAnalysis] = useState<DbAnalysis | null>(null);
  const [serverBlockers, setServerBlockers] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(ANALYSIS_STEPS[0].progress);

  const scanning = metrics.autoTradeEnabled && !hasOpenPosition;

  const { signal, isLoading } = useUnifiedSignal({
    symbol,
    timeframes: MTF_TIMEFRAMES,
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
    if (!vaultWallet || !metrics.autoTradeEnabled) {
      setServerBlockers([]);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(
          `${getBotApiBase()}/api/bot-status?wallet=${encodeURIComponent(vaultWallet)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { blockers?: string[] };
        setServerBlockers(Array.isArray(data.blockers) ? data.blockers : []);
      } catch {
        /* bot API offline — UI falls back to local readiness */
      }
    };
    void load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [vaultWallet, metrics.autoTradeEnabled]);

  const readiness = useMemo(() => {
    const local = evaluateBotReadiness(signal, {
      autoTradeEnabled: metrics.autoTradeEnabled,
      hasOpenPosition,
      vaultUsd,
    });
    if (serverBlockers.length === 0) return local;
    return readinessFromServerBlockers(serverBlockers);
  }, [signal, metrics.autoTradeEnabled, hasOpenPosition, vaultUsd, serverBlockers]);

  return {
    scanning,
    step,
    progress,
    signal,
    isLoading,
    dbAnalysis,
    activeSymbol: symbol,
    readiness,
  };
}
