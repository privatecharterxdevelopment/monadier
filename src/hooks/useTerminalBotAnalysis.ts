import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { VAULT_CHAIN_ID } from '../lib/vault';
import { useUnifiedSignal } from './useUnifiedSignal';
import { evaluateBotReadiness, readinessFromServerBlockers } from '../lib/botReadiness';
import { MIN_HL_BOT_USD } from '../lib/hyperliquid/hlBotAgent';
import { getBotApiBase, type Timeframe } from '../lib/signalService';

export const ANALYSIS_STEPS = [
  { label: 'Scanning all HL perps', progress: 15 },
  { label: 'Analyzing 1m / 5m charts', progress: 35 },
  { label: 'Checking 15m patterns', progress: 55 },
  { label: 'Evaluating 1h momentum', progress: 75 },
  { label: 'Picking best setup', progress: 95 },
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

type GlobalScanCandidate = {
  coin: string;
  direction: string;
  confidence: number;
  reason?: string;
};

type Options = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  hasOpenPosition: boolean;
  vaultUsd?: number;
  /** Connected wallet the bot trades on (0x…) */
  vaultWallet?: string | null;
  symbol?: string;
  /** Show live scan bar (funded + agent, or bot running). */
  analysisActive?: boolean;
  botRunning?: boolean;
};

export function useTerminalBotAnalysis({
  walletConnected,
  metrics,
  hasOpenPosition,
  vaultUsd = 0,
  vaultWallet,
  symbol = 'ETHUSDT',
  analysisActive,
  botRunning = false,
}: Options) {
  const [dbAnalysis, setDbAnalysis] = useState<DbAnalysis | null>(null);
  const [serverBlockers, setServerBlockers] = useState<string[]>([]);
  const [globalBest, setGlobalBest] = useState<GlobalScanCandidate | null>(null);
  const [globalScanCount, setGlobalScanCount] = useState(0);
  const [globalCoinsScanned, setGlobalCoinsScanned] = useState(0);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(ANALYSIS_STEPS[0].progress);

  const active = analysisActive ?? metrics.autoTradeEnabled;
  const scanning = active;

  const { signal, isLoading } = useUnifiedSignal({
    symbol,
    timeframes: MTF_TIMEFRAMES,
    refreshInterval: 5000,
    autoRefresh: walletConnected && active,
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
    if (!walletConnected || !active) {
      setGlobalBest(null);
      setGlobalScanCount(0);
      setGlobalCoinsScanned(0);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(`${getBotApiBase()}/api/global-signals`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          candidates?: GlobalScanCandidate[];
          count?: number;
          coinsScanned?: number;
        };
        const list = Array.isArray(data.candidates) ? data.candidates : [];
        setGlobalBest(list[0] ?? null);
        setGlobalScanCount(typeof data.count === 'number' ? data.count : list.length);
        setGlobalCoinsScanned(typeof data.coinsScanned === 'number' ? data.coinsScanned : 0);
      } catch {
        /* bot API offline */
      }
    };
    void load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [walletConnected, active]);

  useEffect(() => {
    if (!vaultWallet || !botRunning) {
      setServerBlockers([]);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(
          `${getBotApiBase()}/api/bot-status?wallet=${encodeURIComponent(vaultWallet)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          blockers?: string[];
          globalScan?: {
            best?: GlobalScanCandidate | null;
            coinsScanned?: number;
            candidateCount?: number;
          };
          lastOpenError?: { error: string; coin?: string; at: string } | null;
        };
        const blockers = Array.isArray(data.blockers) ? [...data.blockers] : [];
        if (data.lastOpenError?.error) {
          blockers.push(
            `HL order failed${data.lastOpenError.coin ? ` (${data.lastOpenError.coin})` : ''}: ${data.lastOpenError.error}`
          );
        }
        setServerBlockers(blockers);
        if (data.globalScan?.best) setGlobalBest(data.globalScan.best);
        if (typeof data.globalScan?.coinsScanned === 'number') {
          setGlobalCoinsScanned(data.globalScan.coinsScanned);
        }
        if (typeof data.globalScan?.candidateCount === 'number') {
          setGlobalScanCount(data.globalScan.candidateCount);
        }
      } catch {
        /* bot API offline — UI falls back to local readiness */
      }
    };
    void load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [vaultWallet, botRunning]);

  const readiness = useMemo(() => {
    const local = evaluateBotReadiness(signal, {
      autoTradeEnabled: botRunning,
      hasOpenPosition,
      vaultUsd,
    });
    if (!botRunning && vaultUsd >= MIN_HL_BOT_USD) {
      return {
        canEnter: false,
        headline: 'Bot off',
        detail: 'Press Start bot to trade on these signals.',
      };
    }
    if (serverBlockers.length === 0) return local;
    return readinessFromServerBlockers(serverBlockers);
  }, [signal, botRunning, hasOpenPosition, vaultUsd, serverBlockers]);

  return {
    scanning,
    step,
    progress,
    signal,
    isLoading,
    dbAnalysis,
    activeSymbol: symbol,
    globalBest,
    globalScanCount,
    globalCoinsScanned,
    readiness,
  };
}
