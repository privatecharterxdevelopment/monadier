import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ARBITRUM_ONE_CHAIN_ID } from '../lib/usdcArbitrum';
import { useUnifiedSignal } from './useUnifiedSignal';
import { evaluateBotReadiness, readinessFromServerBlockers } from '../lib/botReadiness';
import { filterUserBlockers } from '../lib/hyperliquid/builderPlatform';
import { isFeeExemptUser } from '../lib/admin';
import { useAuth } from '../contexts/AuthContext';
import { isBotScanNoiseDetail } from '../lib/hlBotReasonLabels';
import { HL_MAX_CONCURRENT_POSITIONS, HL_SCAN_ROTATION_COINS, HL_SCAN_UNIVERSE_SIZE, HL_MIN_SIGNAL_CONFIDENCE } from '../lib/hlBotConstants';
import { MIN_HL_BOT_USD } from '../lib/hyperliquid/hlBotAgent';
import {
  filterStaleHlBalanceBlockers,
  shouldHideLastOpenError,
} from '../lib/hyperliquid/balanceGate';
import { fetchBotApi } from '../lib/botApiFetch';
import { getBotApiBase, type Timeframe } from '../lib/signalService';
import { binanceSymbolToHlCoin, hlCoinToBotSymbol, isBotExcludedHlCoin } from '../lib/botTradingPairs';
import { normalizeHlBotStrategy, type HlBotStrategy } from '../lib/hlBotStrategy';
import { pickNextScanCandidate } from '../lib/botScanCandidate';
import { isBotEntryBlocked, botAnalyzerStatusCopy } from '../lib/botAnalyzerActive';
import { nextPollDelayMs } from '../lib/pollBackoff';

export const ANALYSIS_STEPS = [
  { label: 'Scanning all HL perps', progress: 15 },
  { label: 'Analyzing 5m / 15m charts', progress: 35 },
  { label: 'Checking 15m patterns', progress: 55 },
  { label: 'Evaluating 1h momentum', progress: 75 },
  { label: 'Picking best setup', progress: 95 },
] as const;

const MTF_TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h'];

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

function mergeGlobalScanCandidates(
  data: {
    candidates?: GlobalScanCandidate[];
    standardCandidates?: GlobalScanCandidate[];
    aggressiveCandidates?: GlobalScanCandidate[];
  },
  botStrategy: 'standard' | 'profit_grabber' = 'standard'
): GlobalScanCandidate[] {
  const standard = Array.isArray(data.standardCandidates) ? data.standardCandidates : [];
  const aggressive = Array.isArray(data.aggressiveCandidates) ? data.aggressiveCandidates : [];
  const modeList = botStrategy === 'profit_grabber' ? aggressive : standard;
  const allowed = (list: GlobalScanCandidate[]) =>
    list
      .filter((c) => c?.coin && !isBotExcludedHlCoin(c.coin))
      .sort((a, b) => b.confidence - a.confidence);
  if (modeList.length > 0) return allowed(modeList);
  if (Array.isArray(data.candidates) && data.candidates.length > 0) {
    return allowed(data.candidates);
  }
  return allowed(botStrategy === 'profit_grabber' ? aggressive : standard);
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
  /** Bot mode — Standard uses MTF scan only; Aggressive uses scalp scan. */
  hlBotStrategy?: HlBotStrategy | string | null;
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
  hlBotStrategy = 'standard',
}: Options) {
  const { user } = useAuth();
  const feeExempt = isFeeExemptUser(user?.email, vaultWallet);
  const botMode = normalizeHlBotStrategy(hlBotStrategy ?? 'standard');
  const [dbAnalysis, setDbAnalysis] = useState<DbAnalysis | null>(null);
  const [serverBlockers, setServerBlockers] = useState<string[]>([]);
  const [serverMaxSlots, setServerMaxSlots] = useState(maxConcurrentPositions);
  const [globalBest, setGlobalBest] = useState<GlobalScanCandidate | null>(null);
  const [globalCandidates, setGlobalCandidates] = useState<GlobalScanCandidate[]>([]);
  const [serverOpenCoins, setServerOpenCoins] = useState<string[]>([]);
  const [globalScanCount, setGlobalScanCount] = useState(0);
  const [globalCoinsScanned, setGlobalCoinsScanned] = useState(0);
  const [scanUniverseCoins, setScanUniverseCoins] = useState<string[]>([]);
  const [openUniverseSummary, setOpenUniverseSummary] = useState<string | null>(null);
  const [rawScanCandidateCount, setRawScanCandidateCount] = useState(0);
  const [pumpSweepLines, setPumpSweepLines] = useState<string[]>([]);
  const [serverCanTrade, setServerCanTrade] = useState<boolean | null>(null);
  const [lastOpenErrorText, setLastOpenErrorText] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [coinRotationIndex, setCoinRotationIndex] = useState(0);
  const [progress, setProgress] = useState(ANALYSIS_STEPS[0].progress);

  const effectiveOpenCount = useMemo(() => {
    const merged = new Set<string>();
    for (const coin of openPositionCoins) merged.add(coin.toUpperCase());
    for (const coin of serverOpenCoins) merged.add(coin.toUpperCase());
    if (merged.size > 0) return merged.size;
    return openPositionsCount;
  }, [openPositionCoins, serverOpenCoins, openPositionsCount]);

  const slotsLeft = effectiveOpenCount < serverMaxSlots;
  const slotsFull = effectiveOpenCount >= serverMaxSlots;

  const entryBlocked = useMemo(
    () =>
      isBotEntryBlocked({
        botRunning,
        blockers: serverBlockers,
        lastOpenError: lastOpenErrorText,
        slotsFull,
      }),
    [botRunning, serverBlockers, lastOpenErrorText, slotsFull]
  );

  /** 0/N or 1/N open → full scan; N/N → pause scan (monitor exits only). */
  const analyzerActive = botRunning && (analysisActive ?? false) && slotsLeft;
  const active = analyzerActive;
  const scanning = active;

  const effectiveOpenCoins = useMemo(() => {
    const merged = new Set<string>();
    for (const coin of openPositionCoins) merged.add(coin.toUpperCase());
    for (const coin of serverOpenCoins) merged.add(coin.toUpperCase());
    return [...merged];
  }, [openPositionCoins, serverOpenCoins]);

  const scanCandidate = useMemo(
    () =>
      pickNextScanCandidate(globalCandidates, globalBest, effectiveOpenCoins),
    [globalCandidates, globalBest, effectiveOpenCoins]
  );

  const scanRotationCoins = useMemo(() => {
    const fromApi = scanUniverseCoins.map((c) => c.toUpperCase()).filter(Boolean);
    if (fromApi.length > 0) return fromApi;
    const n = globalCoinsScanned > 0 ? globalCoinsScanned : HL_SCAN_UNIVERSE_SIZE;
    return HL_SCAN_ROTATION_COINS.slice(0, Math.min(n, HL_SCAN_ROTATION_COINS.length));
  }, [scanUniverseCoins, globalCoinsScanned]);

  const scanCoinTotal = scanRotationCoins.length;
  const scanCoinIndex =
    scanCoinTotal > 0 ? coinRotationIndex % scanCoinTotal : 0;

  const currentlyScanningCoin = scanRotationCoins[scanCoinIndex] ?? 'BTC';

  const chartCoin = binanceSymbolToHlCoin(symbol).toUpperCase();
  const chartIsOpenPair =
    effectiveOpenCount > 0 && effectiveOpenCoins.includes(chartCoin);

  /** MTF symbol for the next free slot — never the already-open pair. */
  const scanSymbol = useMemo(() => {
    if (scanCandidate?.coin) {
      return hlCoinToBotSymbol(scanCandidate.coin);
    }
    if (slotsLeft && chartIsOpenPair) {
      return null;
    }
    if (active) {
      return hlCoinToBotSymbol(currentlyScanningCoin);
    }
    return symbol;
  }, [scanCandidate?.coin, slotsLeft, chartIsOpenPair, symbol, active, currentlyScanningCoin]);

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
      setCoinRotationIndex(0);
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
    if (!scanning || scanRotationCoins.length === 0) {
      setCoinRotationIndex(0);
      return;
    }
    const ms = Math.min(1200, Math.max(450, Math.round(90_000 / scanRotationCoins.length)));
    const id = setInterval(() => {
      setCoinRotationIndex((i) => (i + 1) % scanRotationCoins.length);
    }, ms);
    return () => clearInterval(id);
  }, [scanning, scanRotationCoins]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('bot_analysis')
        .select('signal, confidence, rsi, trend, pattern, recommendation, updated_at')
        .eq('chain_id', ARBITRUM_ONE_CHAIN_ID)
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
    if (!walletConnected || !analyzerActive) {
      setGlobalBest(null);
      setGlobalCandidates([]);
      setGlobalScanCount(0);
      setGlobalCoinsScanned(0);
      setScanUniverseCoins([]);
      if (!botRunning) setServerBlockers([]);
      setStep(0);
      setCoinRotationIndex(0);
      setProgress(ANALYSIS_STEPS[0].progress);
      return;
    }
    let cancelled = false;
    let delayMs = 3_000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!cancelled) timer = setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      let ok = false;
      try {
        const res = await fetchBotApi('/api/global-signals', { retries: 2 });
        ok = res.ok;
        if (!res.ok) return;
        const data = (await res.json()) as {
          candidates?: GlobalScanCandidate[];
          standardCandidates?: GlobalScanCandidate[];
          aggressiveCandidates?: GlobalScanCandidate[];
          tradeableCandidates?: GlobalScanCandidate[];
          count?: number;
          coinsScanned?: number;
          scanUniverseCoins?: string[];
          standard?: number;
          aggressive?: number;
          openUniverse?: { summary?: string };
        };
        const rawList =
          Array.isArray(data.tradeableCandidates) && data.tradeableCandidates.length > 0
            ? data.tradeableCandidates
            : mergeGlobalScanCandidates(data, botMode);
        const list = [...rawList].sort((a, b) => b.confidence - a.confidence);
        setGlobalCandidates(list);
        const next = pickNextScanCandidate(list, list[0] ?? null, effectiveOpenCoins);
        setGlobalBest(next);
        setGlobalScanCount(typeof data.count === 'number' ? data.count : list.length);
        setGlobalCoinsScanned(typeof data.coinsScanned === 'number' ? data.coinsScanned : 0);
        if (Array.isArray(data.scanUniverseCoins) && data.scanUniverseCoins.length > 0) {
          setScanUniverseCoins(data.scanUniverseCoins.map((c) => c.toUpperCase()));
        }
        setOpenUniverseSummary(data.openUniverse?.summary ?? null);
        setRawScanCandidateCount(
          (typeof data.standard === 'number' ? data.standard : 0) +
            (typeof data.aggressive === 'number' ? data.aggressive : 0)
        );
      } catch {
        ok = false;
      } finally {
        delayMs = nextPollDelayMs(delayMs, ok);
        schedule();
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [walletConnected, analyzerActive, botRunning, effectiveOpenCoins, botMode]);

  useEffect(() => {
    if (!vaultWallet || !botRunning) {
      setServerBlockers([]);
      setPumpSweepLines([]);
      setServerCanTrade(null);
      setLastOpenErrorText(null);
      return;
    }
    let cancelled = false;
    let delayMs = 5_000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!cancelled) timer = setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      let ok = false;
      try {
        const res = await fetchBotApi(
          `/api/bot-status?wallet=${encodeURIComponent(vaultWallet)}`,
          { retries: 2, timeoutMs: 30_000 }
        );
        ok = res.ok;
        if (!res.ok) return;
        const data = (await res.json()) as {
          canTrade?: boolean;
          blockers?: string[];
          userBlockers?: string[];
          marketBlockers?: string[];
          hyperliquid?: { maxConcurrentPositions?: number; openCoins?: string[] };
          globalScan?: {
            best?: GlobalScanCandidate | null;
            coinsScanned?: number;
            scanUniverseCoins?: string[];
            candidateCount?: number;
            rawCandidateCount?: number;
            candidates?: GlobalScanCandidate[];
            openUniverse?: { summary?: string };
            filterReasons?: string[];
          };
          pumpSweep?: { lines?: string[] };
          lastOpenError?: { error: string; coin?: string; at: string } | null;
        };
        if (typeof data.canTrade === 'boolean') {
          setServerCanTrade(data.canTrade);
        }
        const apiUserBlockers = Array.isArray(data.userBlockers) ? data.userBlockers : [];
        const apiMarketBlockers = Array.isArray(data.marketBlockers) ? data.marketBlockers : [];
        const blockers =
          apiUserBlockers.length > 0 || apiMarketBlockers.length > 0
            ? [...apiUserBlockers, ...apiMarketBlockers]
            : Array.isArray(data.blockers)
              ? [...data.blockers]
              : [];
        if (typeof data.hyperliquid?.maxConcurrentPositions === 'number') {
          setServerMaxSlots(data.hyperliquid.maxConcurrentPositions);
        }
        const openCoins = Array.isArray(data.hyperliquid?.openCoins)
          ? data.hyperliquid.openCoins
          : [];
        setServerOpenCoins(openCoins);
        const candidates = Array.isArray(data.globalScan?.candidates)
          ? [...data.globalScan.candidates].sort((a, b) => b.confidence - a.confidence)
          : [];
        for (const reason of data.globalScan?.filterReasons ?? []) {
          if (reason && !blockers.includes(reason)) blockers.push(reason);
        }
        setGlobalCandidates(candidates);
        const nextCandidate = pickNextScanCandidate(
          candidates,
          data.globalScan?.best ?? null,
          openCoins
        );
        if (data.lastOpenError?.error) {
          const hideLastOpen = shouldHideLastOpenError(
            data.lastOpenError.error,
            vaultUsd,
            MIN_HL_BOT_USD
          );
          if (!hideLastOpen) {
            const marginStale =
              /free margin too low|margin too small/i.test(data.lastOpenError.error) &&
              vaultUsd >= MIN_HL_BOT_USD &&
              openCoins.length === 0;
            if (!marginStale) {
              const openMsg = data.lastOpenError.coin
                ? `Last open attempt (${data.lastOpenError.coin}): ${data.lastOpenError.error}`
                : data.lastOpenError.error;
              blockers.push(openMsg);
              setLastOpenErrorText(data.lastOpenError.error);
            } else {
              setLastOpenErrorText(null);
            }
          } else {
            setLastOpenErrorText(null);
          }
        } else {
          setLastOpenErrorText(null);
        }
        setServerBlockers(
          filterStaleHlBalanceBlockers(
            filterUserBlockers(blockers, { exemptFromFees: feeExempt }),
            vaultUsd,
            MIN_HL_BOT_USD
          )
        );
        setPumpSweepLines(
          Array.isArray(data.pumpSweep?.lines)
            ? data.pumpSweep.lines.filter((line) => typeof line === 'string' && line.trim())
            : []
        );
        if (nextCandidate) setGlobalBest(nextCandidate);
        if (typeof data.globalScan?.coinsScanned === 'number') {
          setGlobalCoinsScanned(data.globalScan.coinsScanned);
        }
        if (
          Array.isArray(data.globalScan?.scanUniverseCoins) &&
          data.globalScan.scanUniverseCoins.length > 0
        ) {
          setScanUniverseCoins(data.globalScan.scanUniverseCoins.map((c) => c.toUpperCase()));
        }
        if (typeof data.globalScan?.candidateCount === 'number') {
          setGlobalScanCount(data.globalScan.candidateCount);
        }
        if (data.globalScan?.openUniverse?.summary) {
          setOpenUniverseSummary(data.globalScan.openUniverse.summary);
        }
        if (typeof data.globalScan?.rawCandidateCount === 'number') {
          setRawScanCandidateCount(data.globalScan.rawCandidateCount);
        }
      } catch {
        ok = false;
      } finally {
        delayMs = nextPollDelayMs(delayMs, ok);
        schedule();
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [vaultWallet, botRunning, vaultUsd, feeExempt]);

  const readiness = useMemo(() => {
    if (!botRunning) {
      return {
        canEnter: false,
        headline: 'Bot off',
        detail:
          vaultUsd >= MIN_HL_BOT_USD
            ? 'Press Start bot to trade on these signals.'
            : `At least $${MIN_HL_BOT_USD} USDC on Hyperliquid to trade.`,
      };
    }

    const status = botAnalyzerStatusCopy({
      botRunning,
      blockers: serverBlockers,
      lastOpenError: lastOpenErrorText,
      slotsFull,
      openCount: effectiveOpenCount,
      maxSlots: serverMaxSlots,
    });
    if (status.title === 'Bot waiting') {
      return {
        canEnter: false,
        headline: status.title,
        detail: status.detail,
      };
    }
    if (slotsFull) {
      return {
        canEnter: false,
        headline: status.title,
        detail: status.detail,
      };
    }

    const local = evaluateBotReadiness(signal, {
      autoTradeEnabled: botRunning,
      openPositionsCount: effectiveOpenCount,
      maxConcurrentPositions: serverMaxSlots,
      vaultUsd,
      nextSetup: scanCandidate,
    });

    if (serverBlockers.length === 0) {
      if (globalScanCount === 0 && globalCoinsScanned > 0 && !scanCandidate) {
        const rawHint =
          rawScanCandidateCount === 0
            ? `Scanned ${globalCoinsScanned} HL perps — no pair meets ${HL_MIN_SIGNAL_CONFIDENCE}%+ MTF right now`
            : `Scanned ${globalCoinsScanned} HL perps — macro filters removed all ${rawScanCandidateCount} raw setup(s)`;
        return {
          canEnter: false,
          headline: 'Bot is reading market…',
          detail: rawHint,
        };
      }
      return {
        ...local,
        headline: local.headline === 'Scanning markets' ? 'Bot is reading market…' : local.headline,
      };
    }

    const server = readinessFromServerBlockers(serverBlockers);
    if (local.canEnter && server.detail) {
      return {
        canEnter: false,
        headline: 'Bot is reading market…',
        detail: server.detail,
      };
    }
    if (server.detail) {
      return {
        canEnter: false,
        headline: 'Bot is reading market…',
        detail: server.detail,
      };
    }
    return {
      ...local,
      headline: local.headline === 'Scanning markets' ? 'Bot is reading market…' : local.headline,
    };
  }, [
    signal,
    botRunning,
    lastOpenErrorText,
    openPositionsCount,
    effectiveOpenCount,
    serverMaxSlots,
    slotsFull,
    vaultUsd,
    serverBlockers,
    scanCandidate,
    globalScanCount,
    globalCoinsScanned,
    rawScanCandidateCount,
  ]);

  const displaySymbol = useMemo(() => {
    if (scanCandidate?.coin) return hlCoinToBotSymbol(scanCandidate.coin);
    return hlCoinToBotSymbol(currentlyScanningCoin);
  }, [scanCandidate?.coin, currentlyScanningCoin]);

  return {
    scanning,
    analyzerActive,
    entryBlocked,
    step: scanning ? step : 0,
    progress: scanning ? progress : ANALYSIS_STEPS[0].progress,
    signal: scanning ? signal : null,
    isLoading: scanning && isLoading,
    dbAnalysis: scanning ? dbAnalysis : null,
    activeSymbol: scanning ? displaySymbol : undefined,
    scanSymbol: scanning ? scanSymbol : null,
    scanCandidate: scanning ? scanCandidate : null,
    globalBest: scanning ? globalBest : null,
    globalScanCount: scanning ? globalScanCount : 0,
    globalCoinsScanned: scanning ? globalCoinsScanned : 0,
    scanCoinIndex: scanning ? scanCoinIndex : 0,
    scanCoinTotal: scanning ? scanCoinTotal : 0,
    readiness,
    openPositionsCount: effectiveOpenCount,
    maxConcurrentPositions: serverMaxSlots,
    slotsFull,
    currentlyScanningCoin,
    scanRotationCoins,
    pumpSweepLines,
  };
}
