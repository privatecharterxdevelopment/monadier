import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ARBITRUM_ONE_CHAIN_ID } from '../lib/usdcArbitrum';
import { evaluateBotReadiness, readinessFromServerBlockers } from '../lib/botReadiness';
import type {
  BotExecutionDiagnostic,
  BotExecutionSnapshot,
  LiveBotPositionView,
} from '../lib/hlExecutionDisplay';
import { filterUserBlockers } from '../lib/hyperliquid/builderPlatform';
import { isFeeExemptUser } from '../lib/admin';
import { useAuth } from '../contexts/AuthContext';
import { isBotScanNoiseDetail } from '../lib/hlBotReasonLabels';
import { HL_MAX_CONCURRENT_POSITIONS, HL_SCAN_ROTATION_COINS, HL_SCAN_UNIVERSE_SIZE, HL_MIN_SIGNAL_CONFIDENCE } from '../lib/hlBotConstants';
import { MIN_HL_BOT_USD } from '../lib/hyperliquid/hlBotAgent';
import {
  filterStaleHlBalanceBlockers,
  isStaleInsufficientMarginBlocker,
  shouldHideLastOpenError,
} from '../lib/hyperliquid/balanceGate';
import { fetchBotApi } from '../lib/botApiFetch';
import type { Timeframe, TimeframeAnalysis, UnifiedSignal } from '../lib/signalService';
import {
  ENGINE_OPEN_TIMEFRAMES,
  engineTfChips,
  parseEngineMtfBreakdown,
} from '../lib/engineOpenTimeframes';
import {
  binanceSymbolToHlCoin,
  hlCoinToBotSymbol,
  isBotTradeableHlCoin,
  isHiddenFromBotUi,
  normalizeHlPerpCoin,
} from '../lib/botTradingPairs';
import { normalizeHlBotStrategy, type HlBotStrategy } from '../lib/hlBotStrategy';
import { pickNextScanCandidate } from '../lib/botScanCandidate';
import { isBotEntryBlocked, botAnalyzerStatusCopy, isMarginEntryBlocked } from '../lib/botAnalyzerActive';
import { scrubBotReadinessForUi } from '../lib/botReadinessDisplay';
import {
  formatOpenBlockReason,
  pickFreshOpenBlock,
  type HlOpenBlockLike,
} from '../lib/hlOpenBlockDisplay';
import { nextPollDelayMs } from '../lib/pollBackoff';
import {
  appendJournalEntry,
  buildBotAnalysisNarrative,
  journalVerdict,
  type BotAnalysisJournalEntry,
} from '../lib/botAnalysisJournal';

export const ANALYSIS_STEPS = [
  { label: 'Reading 1m', progress: 20 },
  { label: 'Reading 5m', progress: 40 },
  { label: 'Reading 15m', progress: 60 },
  { label: 'Reading 1h', progress: 80 },
  { label: 'Picking setup', progress: 95 },
] as const;

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
  queueable?: boolean;
  mtfBreakdown?: string;
};

function mergeGlobalScanCandidates(
  data: {
    candidates?: GlobalScanCandidate[];
    standardCandidates?: GlobalScanCandidate[];
    aggressiveCandidates?: GlobalScanCandidate[];
    botUniverse?: string[];
    scanUniverseCoins?: string[];
  },
  botStrategy: 'standard' | 'profit_grabber' = 'standard'
): GlobalScanCandidate[] {
  const standard = Array.isArray(data.standardCandidates) ? data.standardCandidates : [];
  const aggressive = Array.isArray(data.aggressiveCandidates) ? data.aggressiveCandidates : [];
  const modeList = botStrategy === 'profit_grabber' ? aggressive : standard;
  const liveUniverse = data.botUniverse ?? data.scanUniverseCoins ?? null;
  const allowed = (list: GlobalScanCandidate[]) =>
    list
      .filter((c) => c?.coin && isBotTradeableHlCoin(c.coin, liveUniverse))
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

  useEffect(() => {
    setServerMaxSlots(maxConcurrentPositions);
  }, [maxConcurrentPositions]);

  // Vault settings are the source of truth for slot count. Bot-status can lag
  // a few seconds after save and was overwriting a just-saved 3 back to 2.
  const [globalBest, setGlobalBest] = useState<GlobalScanCandidate | null>(null);
  const [globalCandidates, setGlobalCandidates] = useState<GlobalScanCandidate[]>([]);
  const [boardCandidates, setBoardCandidates] = useState<GlobalScanCandidate[]>([]);
  const [serverOpenCoins, setServerOpenCoins] = useState<string[]>([]);
  const [globalScanCount, setGlobalScanCount] = useState(0);
  const [globalCoinsScanned, setGlobalCoinsScanned] = useState(0);
  const [scanUniverseCoins, setScanUniverseCoins] = useState<string[]>([]);
  const [openUniverseSummary, setOpenUniverseSummary] = useState<string | null>(null);
  const [rawScanCandidateCount, setRawScanCandidateCount] = useState(0);
  const [scanSkips, setScanSkips] = useState<
    Array<{ coin: string; mode?: string; reason: string }>
  >([]);
  const [scanScannedAt, setScanScannedAt] = useState<string | undefined>();
  const [scanComplete, setScanComplete] = useState(true);
  const [pumpSweepLines, setPumpSweepLines] = useState<string[]>([]);
  const [serverCanTrade, setServerCanTrade] = useState<boolean | null>(null);
  const [lastOpenErrorText, setLastOpenErrorText] = useState<string | null>(null);
  const [execution, setExecution] = useState<BotExecutionSnapshot | null>(null);
  const [executionDiagnostic, setExecutionDiagnostic] = useState<BotExecutionDiagnostic | null>(
    null
  );
  const [livePositions, setLivePositions] = useState<LiveBotPositionView[]>([]);
  const [recentOpenBlocks, setRecentOpenBlocks] = useState<HlOpenBlockLike[]>([]);
  const [step, setStep] = useState(0);
  const [coinRotationIndex, setCoinRotationIndex] = useState(0);
  const [progress, setProgress] = useState(ANALYSIS_STEPS[0].progress);
  const [tfRows, setTfRows] = useState<
    Partial<Record<Timeframe, { direction: TimeframeAnalysis['direction']; confidence: number }>>
  >({});
  const [revealedCount, setRevealedCount] = useState(0);
  const [engineUnified, setEngineUnified] = useState<UnifiedSignal | null>(null);
  const [tfLoading, setTfLoading] = useState(false);

  /**
   * Live wallet coins win. Never union with bot-status openCoins — that list
   * lags after closes and was showing 3/3 when only 2 positions were open.
   */
  const effectiveOpenCoins = useMemo(() => {
    const source =
      openPositionCoins.length > 0 ? openPositionCoins : serverOpenCoins;
    const merged = new Set<string>();
    for (const coin of source) {
      const n = normalizeHlPerpCoin(coin);
      if (n) merged.add(n);
    }
    return [...merged];
  }, [openPositionCoins, serverOpenCoins]);

  const effectiveOpenCount = useMemo(() => {
    if (effectiveOpenCoins.length > 0) return effectiveOpenCoins.length;
    return openPositionsCount;
  }, [effectiveOpenCoins, openPositionsCount]);

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

  const marginBlockedRaw = useMemo(
    () => !slotsFull && isMarginEntryBlocked(serverBlockers, lastOpenErrorText),
    [slotsFull, serverBlockers, lastOpenErrorText]
  );

  // Debounce entering the margin-blocked pause so brief HL $0 snapshots don't
  // flash "Insufficient margin" and stop the analyzer.
  const [marginBlocked, setMarginBlocked] = useState(false);
  useEffect(() => {
    if (!marginBlockedRaw) {
      setMarginBlocked(false);
      return;
    }
    const timer = window.setTimeout(() => setMarginBlocked(true), 2_500);
    return () => window.clearTimeout(timer);
  }, [marginBlockedRaw]);

  /** 0/N or 1/N open → full scan; N/N or no free margin → pause scan (monitor exits only). */
  const analyzerActive =
    botRunning && (analysisActive ?? false) && slotsLeft && !marginBlocked;
  const active = analyzerActive;
  const scanning = active;

  const scanCandidate = useMemo(
    () =>
      pickNextScanCandidate(
        globalCandidates,
        globalBest,
        effectiveOpenCoins,
        scanUniverseCoins
      ),
    [globalCandidates, globalBest, effectiveOpenCoins, scanUniverseCoins]
  );

  const scanRotationCoins = useMemo(() => {
    const fromApi = scanUniverseCoins
      .map((c) => c.toUpperCase())
      .filter((c) => c && !isHiddenFromBotUi(c));
    if (fromApi.length > 0) return fromApi;
    const n = globalCoinsScanned > 0 ? globalCoinsScanned : HL_SCAN_UNIVERSE_SIZE;
    return HL_SCAN_ROTATION_COINS.slice(0, Math.min(n, HL_SCAN_ROTATION_COINS.length)).filter(
      (c) => !isHiddenFromBotUi(c)
    );
  }, [scanUniverseCoins, globalCoinsScanned]);

  const scanCoinTotal = scanRotationCoins.length;
  const scanCoinIndex =
    scanCoinTotal > 0 ? coinRotationIndex % scanCoinTotal : 0;

  const currentlyScanningCoin =
    scanCandidate?.coin?.toUpperCase() ?? scanRotationCoins[scanCoinIndex] ?? 'BTC';

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

  const candidateKey = scanCandidate
    ? `${scanCandidate.coin}:${scanCandidate.direction}:${scanCandidate.mtfBreakdown ?? ''}`
    : '';

  useEffect(() => {
    if (!scanning) {
      setStep(0);
      setCoinRotationIndex(0);
      setProgress(ANALYSIS_STEPS[0].progress);
      setTfRows({});
      setRevealedCount(0);
      setEngineUnified(null);
      setTfLoading(false);
      return;
    }

    let cancelled = false;
    let idx = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const walk = async () => {
      while (!cancelled) {
        const fromScan = globalCandidates
          .map((c) => c.coin?.toUpperCase())
          .filter((c): c is string => Boolean(c));
        const focus = scanCandidate?.coin?.toUpperCase() ?? null;
        const coins = focus
          ? [focus]
          : fromScan.length > 0
            ? fromScan
            : scanRotationCoins.length > 0
              ? scanRotationCoins
              : ([currentlyScanningCoin] as string[]);
        const coin = coins[idx % coins.length].toUpperCase();
        const coinPos = coins.indexOf(coin);
        if (coinPos >= 0) setCoinRotationIndex(coinPos);
        setTfRows({});
        setEngineUnified(null);
        setRevealedCount(0);
        setStep(0);
        setProgress(ANALYSIS_STEPS[0].progress);
        setTfLoading(true);

        const engineRow =
          (scanCandidate?.coin?.toUpperCase() === coin ? scanCandidate : null) ??
          globalCandidates.find((c) => c.coin.toUpperCase() === coin) ??
          null;
        const fromEngine = parseEngineMtfBreakdown(engineRow?.mtfBreakdown);
        const pairSymbol = hlCoinToBotSymbol(coin);

        for (let i = 0; i < ENGINE_OPEN_TIMEFRAMES.length; i += 1) {
          if (cancelled) return;
          const tf = ENGINE_OPEN_TIMEFRAMES[i];
          const row = fromEngine[tf] ?? null;
          await sleep(row ? 750 : 350);
          if (cancelled) return;
          if (row) {
            setTfRows((prev) => ({ ...prev, [tf]: row }));
          }
          setRevealedCount(i + 1);
          setStep(i);
          setProgress(ANALYSIS_STEPS[Math.min(i, ANALYSIS_STEPS.length - 1)].progress);
        }

        if (engineRow) {
          setEngineUnified({
            symbol: pairSymbol,
            direction: (String(engineRow.direction).toUpperCase() === 'LONG'
              ? 'LONG'
              : String(engineRow.direction).toUpperCase() === 'SHORT'
                ? 'SHORT'
                : 'HOLD') as UnifiedSignal['direction'],
            confidence: engineRow.confidence,
            timeframes: ENGINE_OPEN_TIMEFRAMES.map((tf) => ({
              timeframe: tf,
              direction: fromEngine[tf]?.direction ?? 'HOLD',
              confidence: fromEngine[tf]?.confidence ?? 0,
              trend: 'SIDEWAYS',
              rsi: 50,
              macdSignal: 'neutral',
              patterns: [],
              support: 0,
              resistance: 0,
              currentPrice: 0,
            })),
            trendAlignment: 0,
            patternStrength: 0,
            patterns: [],
            suggestedEntry: 0,
            suggestedTP: 0,
            suggestedSL: 0,
            reasons: [],
            warnings: [],
            timestamp: Date.now(),
          });
        }

        setTfLoading(false);
        setStep(4);
        setProgress(ANALYSIS_STEPS[4].progress);
        await sleep(focus ? 2800 : 1200);
        if (cancelled) return;
        if (!focus && coins.length > 1) idx += 1;
        else idx = 0;
      }
    };

    void walk();
    return () => {
      cancelled = true;
    };
    // currentlyScanningCoin / globalCandidates read from the latest render via candidateKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, scanRotationCoins.join('|'), candidateKey]);

  useEffect(() => {
    if (!botRunning) {
      setDbAnalysis(null);
      return;
    }
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
  }, [botRunning]);

  useEffect(() => {
    if (!walletConnected || !analyzerActive) {
      setGlobalBest(null);
      setGlobalCandidates([]);
      setBoardCandidates([]);
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
          botUniverse?: string[];
          standard?: number;
          aggressive?: number;
          openUniverse?: { summary?: string };
          scanSkips?: Array<{ coin: string; mode?: string; reason: string }>;
          scannedAt?: string;
          scanComplete?: boolean;
        };
        const liveUniverse = data.botUniverse ?? data.scanUniverseCoins ?? null;
        const boardList = mergeGlobalScanCandidates(data, botMode);
        const tradeableRaw =
          Array.isArray(data.tradeableCandidates) && data.tradeableCandidates.length > 0
            ? data.tradeableCandidates
            : boardList.filter((c) => c.queueable !== false);
        const list = [...tradeableRaw]
          .filter((c) => c?.coin && isBotTradeableHlCoin(c.coin, liveUniverse))
          .sort((a, b) => b.confidence - a.confidence);
        setBoardCandidates(boardList);
        setGlobalCandidates(list);
        const next = pickNextScanCandidate(list, list[0] ?? null, effectiveOpenCoins, liveUniverse);
        setGlobalBest(next);
        setGlobalScanCount(typeof data.count === 'number' ? data.count : list.length);
        setGlobalCoinsScanned(typeof data.coinsScanned === 'number' ? data.coinsScanned : 0);
        if (liveUniverse && liveUniverse.length > 0) {
          setScanUniverseCoins(liveUniverse.map((c) => c.toUpperCase()));
        } else if (Array.isArray(data.scanUniverseCoins) && data.scanUniverseCoins.length > 0) {
          setScanUniverseCoins(data.scanUniverseCoins.map((c) => c.toUpperCase()));
        }
        setOpenUniverseSummary(data.openUniverse?.summary ?? null);
        setRawScanCandidateCount(
          (typeof data.standard === 'number' ? data.standard : 0) +
            (typeof data.aggressive === 'number' ? data.aggressive : 0)
        );
        if (Array.isArray(data.scanSkips)) {
          setScanSkips(data.scanSkips.filter((s) => s?.coin && s?.reason));
        }
        if (data.scannedAt) setScanScannedAt(data.scannedAt);
        if (typeof data.scanComplete === 'boolean') setScanComplete(data.scanComplete);
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
      setRecentOpenBlocks([]);
      return;
    }
    let cancelled = false;
    let delayMs = 7_000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!cancelled) timer = setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      let ok = false;
      try {
        const res = await fetchBotApi(
          `/api/bot-status?wallet=${encodeURIComponent(vaultWallet)}&lite=1`,
          { retries: 1, timeoutMs: 12_000 }
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
            boardCandidates?: GlobalScanCandidate[];
            openUniverse?: { summary?: string };
            filterReasons?: string[];
            scanSkips?: Array<{ coin: string; mode?: string; reason: string }>;
            scannedAt?: string;
            scanComplete?: boolean;
          };
          pumpSweep?: { lines?: string[] };
          lastOpenError?: { error: string; coin?: string; at: string } | null;
          execution?: BotExecutionSnapshot | null;
          executionDiagnostic?: BotExecutionDiagnostic | null;
          livePositions?: LiveBotPositionView[];
          recentOpenBlocks?: HlOpenBlockLike[];
        };
        if (typeof data.canTrade === 'boolean') {
          setServerCanTrade(data.canTrade);
        }
        setExecution(data.execution ?? null);
        setExecutionDiagnostic(data.executionDiagnostic ?? null);
        setLivePositions(Array.isArray(data.livePositions) ? data.livePositions : []);
        const apiUserBlockers = Array.isArray(data.userBlockers) ? data.userBlockers : [];
        const apiMarketBlockers = Array.isArray(data.marketBlockers) ? data.marketBlockers : [];
        const blockers =
          apiUserBlockers.length > 0 || apiMarketBlockers.length > 0
            ? [...apiUserBlockers, ...apiMarketBlockers]
            : Array.isArray(data.blockers)
              ? [...data.blockers]
              : [];
        // Do not overwrite slot count from bot-status — vault settings prop is authoritative.
        const openCoins = Array.isArray(data.hyperliquid?.openCoins)
          ? data.hyperliquid.openCoins
          : [];
        setServerOpenCoins(openCoins);
        const liveUniverse =
          Array.isArray(data.globalScan?.scanUniverseCoins) &&
          data.globalScan.scanUniverseCoins.length > 0
            ? data.globalScan.scanUniverseCoins.filter((c) => !isHiddenFromBotUi(c))
            : scanUniverseCoins.filter((c) => !isHiddenFromBotUi(c));
        const candidates = Array.isArray(data.globalScan?.candidates)
          ? [...data.globalScan.candidates]
              .filter(
                (c) =>
                  c?.coin &&
                  !isHiddenFromBotUi(c.coin) &&
                  isBotTradeableHlCoin(c.coin, liveUniverse)
              )
              .sort((a, b) => b.confidence - a.confidence)
          : [];
        // filterReasons are engine diagnostics — never push to user blockers (scan-cycle panel shows skips).
        setGlobalCandidates(candidates);
        if (Array.isArray(data.globalScan?.boardCandidates) && data.globalScan.boardCandidates.length > 0) {
          setBoardCandidates(
            data.globalScan.boardCandidates.filter(
              (c) =>
                c?.coin &&
                !isHiddenFromBotUi(c.coin) &&
                isBotTradeableHlCoin(c.coin, liveUniverse)
            )
          );
        }
        const nextCandidate = pickNextScanCandidate(
          candidates,
          data.globalScan?.best ?? null,
          openCoins,
          liveUniverse
        );
        if (data.lastOpenError?.error) {
          const hideLastOpen = shouldHideLastOpenError(
            data.lastOpenError.error,
            vaultUsd,
            MIN_HL_BOT_USD
          );
          if (!hideLastOpen) {
            const marginStale = isStaleInsufficientMarginBlocker(
              data.lastOpenError.error,
              vaultUsd,
              openPositionCoins.length,
              MIN_HL_BOT_USD
            );
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
            MIN_HL_BOT_USD,
            openPositionCoins.length
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
        if (Array.isArray(data.globalScan?.scanSkips) && data.globalScan.scanSkips.length > 0) {
          setScanSkips(data.globalScan.scanSkips.filter((s) => s?.coin && s?.reason));
        }
        if (data.globalScan?.scannedAt) setScanScannedAt(data.globalScan.scannedAt);
        if (typeof data.globalScan?.scanComplete === 'boolean') {
          setScanComplete(data.globalScan.scanComplete);
        }
        setRecentOpenBlocks(
          Array.isArray(data.recentOpenBlocks) ? data.recentOpenBlocks : []
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
  }, [vaultWallet, botRunning, vaultUsd, feeExempt, openPositionCoins.length]);

  const rawReadiness = useMemo(() => {
    if (!botRunning) {
      return {
        canEnter: false,
        headline: 'Agent stopped',
        detail:
          vaultUsd >= MIN_HL_BOT_USD
            ? 'Start bot to scan again. Open trades stay open until an exit or you close them.'
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
    // Debounce margin headline the same way we debounce scan-pause — avoid 1–2s $0 flashes.
    if (status.title === 'Insufficient margin' && !marginBlocked) {
      // fall through to normal scanning copy while the raw block is still settling
    } else if (status.title === 'Insufficient margin') {
      return {
        canEnter: false,
        headline: status.title,
        detail: status.detail,
      };
    }
    if (status.title === 'Bot waiting') {
      return {
        canEnter: false,
        headline: 'Bot is reading market…',
        detail: '',
      };
    }
    if (slotsFull) {
      return {
        canEnter: false,
        headline: status.title,
        detail: status.detail,
      };
    }

    const local = evaluateBotReadiness(engineUnified, {
      autoTradeEnabled: botRunning,
      openPositionsCount: effectiveOpenCount,
      maxConcurrentPositions: serverMaxSlots,
      vaultUsd,
      nextSetup: scanCandidate,
      execution,
      executionDiagnostic,
      livePositions,
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
          detail: '',
        };
      }
      return {
        ...local,
        headline: local.headline === 'Scanning markets' ? 'Bot is reading market…' : local.headline,
      };
    }

    const server = readinessFromServerBlockers(serverBlockers);
    const serverDetail =
      server.detail && !isBotScanNoiseDetail(server.detail) ? server.detail : '';
    if (local.headline === 'Opening trade') {
      return local;
    }
    if (local.canEnter && serverDetail) {
      return {
        canEnter: false,
        headline: 'Bot is reading market…',
        detail: serverDetail,
      };
    }
    if (serverDetail) {
      return {
        canEnter: false,
        headline: 'Bot is reading market…',
        detail: serverDetail,
      };
    }
    return {
      ...local,
      headline: local.headline === 'Scanning markets' ? 'Bot is reading market…' : local.headline,
    };
  }, [
    engineUnified,
    botRunning,
    lastOpenErrorText,
    openPositionsCount,
    effectiveOpenCount,
    serverMaxSlots,
    slotsFull,
    vaultUsd,
    serverBlockers,
    scanCandidate,
    execution,
    executionDiagnostic,
    livePositions,
    globalScanCount,
    globalCoinsScanned,
    rawScanCandidateCount,
    marginBlocked,
  ]);

  const readiness = useMemo(
    () => scrubBotReadinessForUi(rawReadiness),
    [rawReadiness]
  );

  const liveNarrative = useMemo(
    () =>
      buildBotAnalysisNarrative({
        coin: currentlyScanningCoin,
        signalDirection: engineUnified?.direction,
        signalConfidence: engineUnified?.confidence,
        entryWaitReason: (() => {
          const coin =
            scanCandidate?.coin ?? globalBest?.coin ?? currentlyScanningCoin ?? undefined;
          const block = pickFreshOpenBlock(recentOpenBlocks, coin);
          if (block) return formatOpenBlockReason(block);
          if (lastOpenErrorText) {
            return formatOpenBlockReason({
              coin,
              reason: lastOpenErrorText,
              gate: 'other',
              confidence: scanCandidate?.confidence ?? globalBest?.confidence,
            });
          }
          return null;
        })(),
        blockers: serverBlockers,
        candidateReason: scanCandidate?.reason ?? globalBest?.reason ?? null,
        candidateCoin: scanCandidate?.coin ?? globalBest?.coin ?? null,
        candidateDirection: scanCandidate?.direction ?? globalBest?.direction ?? null,
        candidateConfidence: scanCandidate?.confidence ?? globalBest?.confidence ?? null,
        readinessHeadline: rawReadiness.headline,
        readinessDetail: rawReadiness.detail,
        scanSkips,
        lastOpenError: lastOpenErrorText,
        execution,
        executionDiagnostic,
      }),
    [
      currentlyScanningCoin,
      engineUnified?.direction,
      engineUnified?.confidence,
      serverBlockers,
      scanCandidate,
      globalBest,
      rawReadiness,
      scanSkips,
      lastOpenErrorText,
      recentOpenBlocks,
      execution,
      executionDiagnostic,
    ]
  );

  const [journalHistory, setJournalHistory] = useState<BotAnalysisJournalEntry[]>([]);

  useEffect(() => {
    if (!botRunning) {
      setJournalHistory([]);
      return;
    }
    const detail = liveNarrative.trim();
    if (!detail) return;
    const lines = detail.split('\n');
    setJournalHistory((prev) =>
      appendJournalEntry(prev, {
        coin: currentlyScanningCoin,
        verdict: journalVerdict(lines),
        detail,
      })
    );
  }, [botRunning, liveNarrative, currentlyScanningCoin]);

  const displaySymbol = useMemo(() => {
    if (scanCandidate?.coin) return hlCoinToBotSymbol(scanCandidate.coin);
    return hlCoinToBotSymbol(currentlyScanningCoin);
  }, [scanCandidate?.coin, currentlyScanningCoin]);

  const tfChips = useMemo(
    () => (scanning ? engineTfChips(revealedCount, tfRows) : engineTfChips(0, {})),
    [scanning, revealedCount, tfRows]
  );

  const displaySignal =
    scanning && revealedCount >= ENGINE_OPEN_TIMEFRAMES.length ? engineUnified : null;
  const combinedReady = Boolean(displaySignal);
  const hideLongPill =
    !combinedReady || String(displaySignal?.direction).toUpperCase() === 'SHORT';

  return {
    botRunning,
    scanning,
    analyzerActive,
    entryBlocked,
    marginBlocked,
    step: scanning ? step : 0,
    progress: scanning ? progress : ANALYSIS_STEPS[0].progress,
    signal: displaySignal,
    isLoading: scanning && tfLoading && revealedCount === 0,
    engineTfChips: tfChips,
    tfRevealComplete: combinedReady,
    dbAnalysis: scanning ? dbAnalysis : null,
    activeSymbol: scanning ? displaySymbol : undefined,
    scanSymbol: scanning ? scanSymbol : null,
    scanCandidate: scanning ? scanCandidate : null,
    boardCandidates: scanning ? boardCandidates : [],
    globalCandidates: scanning ? globalCandidates : [],
    globalBest: scanning ? globalBest : null,
    bestLong:
      scanning && !hideLongPill
        ? [...boardCandidates, ...globalCandidates]
            .filter((c) => String(c.direction).toUpperCase() === 'LONG')
            .sort((a, b) => b.confidence - a.confidence)[0] ?? null
        : null,
    globalScanCount: scanning ? globalScanCount : 0,
    globalCoinsScanned: scanning ? globalCoinsScanned : 0,
    scanSkips: scanning ? scanSkips : [],
    scanScannedAt: scanning ? scanScannedAt : undefined,
    scanComplete: scanning ? scanComplete : true,
    scanCoinIndex: scanning ? scanCoinIndex : 0,
    scanCoinTotal: scanning ? scanCoinTotal : 0,
    readiness,
    openPositionsCount: effectiveOpenCount,
    maxConcurrentPositions: serverMaxSlots,
    slotsFull,
    currentlyScanningCoin,
    scanRotationCoins,
    scanUniverseCoins,
    pumpSweepLines,
    livePositions,
    execution,
    executionDiagnostic,
    liveNarrative,
    journalHistory,
    rawReadiness,
    entryWaitReason: (() => {
      const coin =
        scanCandidate?.coin ?? globalBest?.coin ?? currentlyScanningCoin ?? undefined;
      const block = pickFreshOpenBlock(recentOpenBlocks, coin);
      if (block) return formatOpenBlockReason(block);
      if (lastOpenErrorText) {
        return formatOpenBlockReason({
          coin,
          reason: lastOpenErrorText,
          gate: 'other',
          confidence: scanCandidate?.confidence ?? globalBest?.confidence,
        });
      }
      return null;
    })(),
  };
}
