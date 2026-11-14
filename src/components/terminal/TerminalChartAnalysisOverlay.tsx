import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { ANALYSIS_STEPS } from '../../hooks/useTerminalBotAnalysis';
import { pairLabel } from '../../lib/botTradingPairs';
import type { BotReadiness } from '../../lib/botReadiness';
import type { UnifiedSignal } from '../../lib/signalService';
import type { EngineTfChip } from '../../lib/engineOpenTimeframes';
import { ENGINE_OPEN_TIMEFRAMES } from '../../lib/engineOpenTimeframes';
import {
  executionHeadline,
  type BotExecutionSnapshot,
} from '../../lib/hlExecutionDisplay';
import ProTradeScanCyclePanel from '../protrade/ProTradeScanCyclePanel';
import type { HlScanSkip, ScanCycleCandidate } from '../../lib/hlScanCycleDisplay';

type DbAnalysis = {
  signal: string;
  confidence: number;
  rsi: number;
  trend: string;
  pattern: string | null;
  recommendation: string;
} | null;

type Props = {
  visible: boolean;
  scanning: boolean;
  step: number;
  progress: number;
  isLoading: boolean;
  signal: UnifiedSignal | null;
  dbAnalysis: DbAnalysis;
  activeSymbol?: string;
  globalBest?: { coin: string; direction: string; confidence: number; reason?: string } | null;
  bestLong?: { coin: string; direction: string; confidence: number; reason?: string } | null;
  globalScanCount?: number;
  globalCoinsScanned?: number;
  currentlyScanningCoin?: string;
  scanCoinIndex?: number;
  scanCoinTotal?: number;
  readiness?: BotReadiness;
  openPositionsCount?: number;
  maxConcurrentPositions?: number;
  placement?: 'chart' | 'dock';
  pumpSweepLines?: string[];
  entryWaitReason?: string | null;
  engineTfChips?: EngineTfChip[];
  tfRevealComplete?: boolean;
  execution?: BotExecutionSnapshot | null;
  scanUniverseCoins?: string[];
  scanSkips?: HlScanSkip[];
  scanBoardCandidates?: ScanCycleCandidate[];
  scanScannedAt?: string;
  scanComplete?: boolean;
  openPositionCoins?: string[];
};

function analyzerPhaseLabel(
  execution: BotExecutionSnapshot | null | undefined,
  waitOpen: boolean
): 'SIGNAL' | 'WAITING' | 'BLOCKED' | 'EXECUTING' | null {
  const headline = executionHeadline(execution);
  if (headline === 'Opening trade') return 'EXECUTING';
  if (headline === 'Waiting confirmation' || waitOpen) return 'WAITING';
  if (headline === 'Setup blocked' || headline === 'Order failed') return 'BLOCKED';
  if (headline === 'Candidate') return 'SIGNAL';
  return null;
}

function TfChip({ chip }: { chip: EngineTfChip }) {
  if (!chip.revealed || !chip.direction) {
    return (
      <span className="term-tf-chip term-tf-chip--pending">
        {chip.timeframe} —
      </span>
    );
  }
  const dir = chip.direction.toUpperCase();
  const dirClass =
    dir === 'LONG'
      ? 'term-tf-chip--long'
      : dir === 'SHORT'
        ? 'term-tf-chip--short'
        : 'term-tf-chip--flat';
  return (
    <span className={`term-tf-chip ${dirClass}`}>
      {chip.timeframe} {dir} {Math.round(chip.confidence ?? 0)}%
    </span>
  );
}

const TerminalChartAnalysisOverlay: React.FC<Props> = ({
  visible,
  scanning,
  step,
  progress,
  isLoading,
  signal,
  dbAnalysis,
  activeSymbol,
  globalBest,
  bestLong,
  globalCoinsScanned = 0,
  currentlyScanningCoin,
  scanCoinIndex = 0,
  scanCoinTotal = 0,
  readiness,
  openPositionsCount = 0,
  maxConcurrentPositions = 2,
  placement = 'chart',
  pumpSweepLines,
  entryWaitReason,
  engineTfChips,
  tfRevealComplete = false,
  execution = null,
  scanUniverseCoins = [],
  scanSkips = [],
  scanBoardCandidates = [],
  scanScannedAt,
  scanComplete = true,
  openPositionCoins = [],
}) => {
  const compact = placement === 'dock';

  const action = tfRevealComplete
    ? signal?.direction ?? dbAnalysis?.signal ?? 'HOLD'
    : 'HOLD';
  const conf = tfRevealComplete
    ? Math.round(signal?.confidence ?? dbAnalysis?.confidence ?? 0)
    : 0;
  const hasTfConflict = Boolean(signal?.warnings?.some((w) => /conflict/i.test(w)));
  const waitOpen = Boolean(entryWaitReason) && action !== 'HOLD' && conf >= 52;
  const phase = analyzerPhaseLabel(execution, waitOpen);
  const signalClass = waitOpen
    ? 'term-hint--warn'
    : action === 'LONG'
      ? 'term-pnl-pos'
      : action === 'SHORT'
        ? 'term-pnl-neg'
        : '';

  const activeLabel = activeSymbol ? pairLabel(activeSymbol) : null;

  const headline = useMemo(() => {
    const h = readiness?.headline ?? ANALYSIS_STEPS[step].label;
    if (h.startsWith('Checking ')) return h;
    if (h === 'Bot waiting' && !readiness?.detail?.trim()) return 'Scanning markets';
    return h;
  }, [readiness?.headline, readiness?.detail, step]);

  const scanLabel = useMemo(() => {
    if (!scanning) return headline;
    const coin = currentlyScanningCoin?.toUpperCase();
    const total = scanCoinTotal > 0 ? scanCoinTotal : globalCoinsScanned;
    if (coin && total > 0) {
      const pos = scanCoinTotal > 0 ? scanCoinIndex + 1 : null;
      return pos != null ? `${coin} · ${pos}/${total}` : coin;
    }
    return headline;
  }, [
    scanning,
    headline,
    currentlyScanningCoin,
    scanCoinTotal,
    scanCoinIndex,
    globalCoinsScanned,
  ]);

  const scanMeta = useMemo(() => {
    if (!scanning) return null;
    const total = globalCoinsScanned > 0 ? globalCoinsScanned : scanCoinTotal;
    if (total > 0) return `${total} HL perps`;
    return null;
  }, [scanning, globalCoinsScanned, scanCoinTotal]);

  if (compact) {
    return (
      <div className="term-dock-analysis">
        <div className="term-analysis-bar term-analysis-bar--compact hl-bot-analyzer-bar">
          <div className="hl-bot-analyzer-pills">
            <div className="hl-bot-analyzer-pill">
              <span className="hl-bot-analyzer-pill__label">Scan</span>
              <span className="hl-bot-analyzer-pill__value hl-bot-analyzer-pill__value--row">
                {scanning ? (
                  <Activity size={11} className="term-analysis-pulse" aria-hidden />
                ) : null}
                <span>{scanLabel}</span>
                {scanMeta ? (
                  <span className="hl-bot-analyzer-pill__meta">{scanMeta}</span>
                ) : null}
                {scanning ? (
                  <span className="hl-bot-analyzer-pill__meta">{Math.round(progress)}%</span>
                ) : null}
              </span>
            </div>
            {phase ? (
              <div className="hl-bot-analyzer-pill">
                <span className="hl-bot-analyzer-pill__label">Phase</span>
                <span
                  className={`hl-bot-analyzer-pill__value ${
                    phase === 'BLOCKED'
                      ? 'term-pnl-neg'
                      : phase === 'WAITING'
                        ? 'term-hint--warn'
                        : phase === 'EXECUTING'
                          ? 'term-pnl-pos'
                          : ''
                  }`}
                >
                  {phase}
                </span>
              </div>
            ) : null}
            <div className="hl-bot-analyzer-pill">
              <span className="hl-bot-analyzer-pill__label">{waitOpen ? 'Wait' : 'Signal'}</span>
              <span className={`hl-bot-analyzer-pill__value ${tfRevealComplete ? signalClass : ''}`}>
                {tfRevealComplete
                  ? waitOpen
                    ? `${action} ${conf}% · blocked`
                    : `${action} ${conf}%`
                  : '—'}
                {tfRevealComplete && hasTfConflict ? (
                  <span className="hl-bot-analyzer-pill__meta term-hint--warn"> mixed</span>
                ) : null}
              </span>
            </div>
            {bestLong &&
            String(bestLong.direction).toUpperCase() === 'LONG' &&
            !(
              String(action).toUpperCase() === 'LONG' &&
              bestLong.coin.toUpperCase() === (currentlyScanningCoin ?? '').toUpperCase()
            ) ? (
              <div className="hl-bot-analyzer-pill">
                <span className="hl-bot-analyzer-pill__label">Long</span>
                <span className="hl-bot-analyzer-pill__value term-pnl-pos">
                  {bestLong.coin.toUpperCase()} {Math.round(bestLong.confidence)}%
                </span>
              </div>
            ) : null}
            {activeLabel ? (
              <div className="hl-bot-analyzer-pill">
                <span className="hl-bot-analyzer-pill__label">Pair</span>
                <span className="hl-bot-analyzer-pill__value">
                  {currentlyScanningCoin?.toUpperCase() ?? activeLabel}
                </span>
              </div>
            ) : null}
            <div className="hl-bot-analyzer-tf-row">
              {(engineTfChips && engineTfChips.length > 0
                ? engineTfChips
                : ENGINE_OPEN_TIMEFRAMES.map((timeframe) => ({
                    timeframe,
                    direction: null,
                    confidence: null,
                    revealed: false,
                  }))
              ).map((chip) => (
                <TfChip key={chip.timeframe} chip={chip} />
              ))}
            </div>
          </div>
          <ProTradeScanCyclePanel
            universe={scanUniverseCoins}
            candidates={scanBoardCandidates}
            skips={scanSkips}
            openCoins={openPositionCoins}
            currentlyScanning={currentlyScanningCoin}
            scannedAt={scanScannedAt}
            coinsScanned={globalCoinsScanned}
            scanComplete={scanComplete}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="term-chart-overlay">
      <div className="term-analysis-bar">
        {scanning ? (
          <div className="term-analysis-bar-top">
            <Activity size={14} className="term-analysis-pulse" aria-hidden />
            <span className="term-analysis-step">{headline}</span>
            <div className="term-analysis-track">
              <div className="term-analysis-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="term-analysis-pct">{Math.round(progress)}%</span>
          </div>
        ) : null}
        <div className="term-analysis-meta">
          <span className={tfRevealComplete ? signalClass : ''}>
            {tfRevealComplete ? action : '—'}
          </span>
          <span className="term-analysis-sep">·</span>
          <span title="Combined 1m+5m+15m+1h">
            {tfRevealComplete ? `${conf}% combined` : 'waiting TFs'}
          </span>
          {activeLabel ? (
            <>
              <span className="term-analysis-sep">·</span>
              <span>{activeLabel}</span>
            </>
          ) : null}
        </div>
        <div className="term-tf-row term-tf-row--overlay">
          {(engineTfChips && engineTfChips.length > 0
            ? engineTfChips
            : ENGINE_OPEN_TIMEFRAMES.map((timeframe) => ({
                timeframe,
                direction: null,
                confidence: null,
                revealed: false,
              }))
          ).map((chip) => (
            <TfChip key={chip.timeframe} chip={chip} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TerminalChartAnalysisOverlay;
