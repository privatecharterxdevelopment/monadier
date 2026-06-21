import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { VAULT_CHAIN_ID } from '../lib/vault';
import { useUnifiedSignal } from './useUnifiedSignal';
import { evaluateBotReadiness, readinessFromServerBlockers } from '../lib/botReadiness';
import { filterUserBlockers } from '../lib/hyperliquid/builderPlatform';
import { isBotScanNoiseDetail } from '../lib/hlBotReasonLabels';
import { HL_MAX_CONCURRENT_POSITIONS, HL_SCAN_ROTATION_COINS, HL_SCAN_UNIVERSE_SIZE } from '../lib/hlBotConstants';
import { MIN_HL_BOT_USD } from '../lib/hyperliquid/hlBotAgent';
import { getBotApiBase, type Timeframe } from '../lib/signalService';
import { binanceSymbolToHlCoin, hlCoinToBotSymbol } from '../lib/botTradingPairs';
import { pickNextScanCandidate } from '../lib/botScanCandidate';

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

function mergeGlobalScanCandidates(data: {
  candidates?: GlobalScanCandidate[];
  standardCandidates?: GlobalScanCandidate[];
  aggressiveCandidates?: GlobalScanCandidate[];
}): GlobalScanCandidate[] {
  if (Array.isArray(data.candidates) && data.candidates.length > 0) {
    return data.candidates;
  }
  const standard = Array.isArray(data.standardCandidates) ? data.standardCandidates : [];
  const aggressive = Array.isArray(data.aggressiveCandidates) ? data.aggressiveCandidates : [];
  const merged = [...standard, ...aggressive];
  const seen = new Set<string>();
  return merged.filter((c) => {
    const key = c.coin?.toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type Options = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  openPositionsCount: number;
  maxConcurrentPositions?: number;
  vaultUsd?: number;
  /** Connected wallet the bot trades on (0x…) */
  vaultWallet?: string | null;
  /** HL coins with an open bot position — used to pick the next scan pair. */
  openPositionCoins?: string[];
  symbol?: string;
  /** Show live scan bar (funded + agent, or bot running). */
  analysisActive?: boolean;
  botRunning?: boolean;
};

export function useTerminalBotAnalysis({
  walletConnected,
  metrics,
  openPositionsCount,
  maxConcurrentPositions = HL_MAX_CONCURRENT_POSITIONS,
  vaultUsd = 0,
  vaultWallet,
  openPositionCoins = [],
  symbol = 'ETHUSDT',
  analysisActive,
  botRunning = false,
}: Options) {
  const [dbAnalysis, setDbAnalysis] = useState<DbAnalysis | null>(null);
  const [serverBlockers, setServerBlockers] = useState<string[]>([]);
  const [serverMaxSlots, setServerMaxSlots] = useState(maxConcurrentPositions);
  const [globalBest, setGlobalBest] = useState<GlobalScanCandidate | null>(null);
  const [globalCandidates, setGlobalCandidates] = useState<GlobalScanCandidate[]>([]);
  const [serverOpenCoins, setServerOpenCoins] = useState<string[]>([]);
  const [globalScanCount, setGlobalScanCount] = useState(0);
  const [globalCoinsScanned, setGlobalCoinsScanned] = useState(0);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(ANALYSIS_STEPS[0].progress);

  const active = analysisActive ?? metrics.autoTradeEnabled;
  const scanning = active;

  const effectiveOpenCoins = useMemo(() => {
    const merged = new Set<string>();
    for (const coin of openPositionCoins) merged.add(coin.toUpperCase());
    for (const coin of serverOpenCoins) merged.add(coin.toUpperCase());
    return [...merged];
  }, [openPositionCoins, serverOpenCoins]);

  const slotsLeft = openPositionsCount < serverMaxSlots;

  const scanCandidate = useMemo(
    () =>
      pickNextScanCandidate(globalCandidates, globalBest, effectiveOpenCoins),
    [globalCandidates, globalBest, effectiveOpenCoins]
  );

  const chartCoin = binanceSymbolToHlCoin(symbol).toUpperCase();
  const chartIsOpenPair =
    openPositionsCount > 0 && effectiveOpenCoins.includes(chartCoin);

  /** MTF symbol for the next free slot — never the already-open pair. */
  const scanSymbol = useMemo(() => {
    if (scanCandidate?.coin) {
      return hlCoinToBotSymbol(scanCandidate.coin);
    }
    if (slotsLeft && chartIsOpenPair) {
      return null;
    }
    return symbol;
  }, [scanCandidate?.coin, slotsLeft, chartIsOpenPair, symbol]);

  const signalEnabled = Boolean(scanSymbol) && walletConnected && active;

  const { signal, isLoading } = useUnifiedSignal({
    symbol: scanSymbol ?? 'ETHUSDT',
    timeframes: MTF_TIMEFRAMES,
    refreshInterval: 5000,
    autoRefresh: signalEnabled,
    enabled: signalEnabled,
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
      setGlobalCandidates([]);
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
          standardCandidates?: GlobalScanCandidate[];
          aggressiveCandidates?: GlobalScanCandidate[];
          count?: number;
          coinsScanned?: number;
        };
        const list = mergeGlobalScanCandidates(data);
        setGlobalCandidates(list);
        const next = pickNextScanCandidate(list, list[0] ?? null, effectiveOpenCoins);
        setGlobalBest(next);
        setGlobalScanCount(typeof data.count === 'number' ? data.count : list.length);
        setGlobalCoinsScanned(typeof data.coinsScanned === 'number' ? data.coinsScanned : 0);
      } catch {
        /* bot API offline */
      }
    };
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [walletConnected, active, effectiveOpenCoins]);

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
          hyperliquid?: { maxConcurrentPositions?: number; openCoins?: string[] };
          globalScan?: {
            best?: GlobalScanCandidate | null;
            coinsScanned?: number;
            candidateCount?: number;
            candidates?: GlobalScanCandidate[];
          };
          lastOpenError?: { error: string; coin?: string; at: string } | null;
        };
        const blockers = Array.isArray(data.blockers) ? [...data.blockers] : [];
        if (typeof data.hyperliquid?.maxConcurrentPositions === 'number') {
          setServerMaxSlots(data.hyperliquid.maxConcurrentPositions);
        }
        const openCoins = Array.isArray(data.hyperliquid?.openCoins)
          ? data.hyperliquid.openCoins
          : [];
        setServerOpenCoins(openCoins);
        const candidates = Array.isArray(data.globalScan?.candidates)
          ? data.globalScan.candidates
          : [];
        setGlobalCandidates(candidates);
        const nextCandidate = pickNextScanCandidate(
          candidates,
          data.globalScan?.best ?? null,
          openCoins
        );
        if (data.lastOpenError?.error && !isBotScanNoiseDetail(data.lastOpenError.error)) {
          blockers.push(
            `HL order failed${data.lastOpenError.coin ? ` (${data.lastOpenError.coin})` : ''}: ${data.lastOpenError.error}`
          );
        }
        setServerBlockers(filterUserBlockers(blockers));
        if (nextCandidate) setGlobalBest(nextCandidate);
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
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [vaultWallet, botRunning]);

  const readiness = useMemo(() => {
    const local = evaluateBotReadiness(signal, {
      autoTradeEnabled: botRunning,
      openPositionsCount,
      maxConcurrentPositions: serverMaxSlots,
      vaultUsd,
      nextSetup: scanCandidate,
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
  }, [
    signal,
    botRunning,
    openPositionsCount,
    serverMaxSlots,
    vaultUsd,
    serverBlockers,
    scanCandidate,
  ]);

  const slotsFull = openPositionsCount >= serverMaxSlots;

  const scanRotationCoins = useMemo(() => {
    const fromScan = globalCandidates.map((c) => c.coin.toUpperCase()).filter(Boolean);
    if (fromScan.length >= 3) return fromScan;
    const n = globalCoinsScanned > 0 ? globalCoinsScanned : HL_SCAN_UNIVERSE_SIZE;
    return HL_SCAN_ROTATION_COINS.slice(0, Math.min(n, HL_SCAN_ROTATION_COINS.length));
  }, [globalCandidates, globalCoinsScanned]);

  const currentlyScanningCoin =
    scanRotationCoins[step % Math.max(scanRotationCoins.length, 1)] ?? 'BTC';

  const displaySymbol = useMemo(() => {
    if (scanCandidate?.coin) return hlCoinToBotSymbol(scanCandidate.coin);
    return hlCoinToBotSymbol(currentlyScanningCoin);
  }, [scanCandidate?.coin, currentlyScanningCoin]);

  return {
    scanning,
    step,
    progress,
    signal,
    isLoading,
    dbAnalysis,
    activeSymbol: displaySymbol,
    scanSymbol,
    scanCandidate,
    globalBest,
    globalScanCount,
    globalCoinsScanned,
    readiness,
    openPositionsCount,
    maxConcurrentPositions: serverMaxSlots,
    slotsFull,
    currentlyScanningCoin,
    scanRotationCoins,
  };
}
