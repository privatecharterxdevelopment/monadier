import React, { useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { ANALYSIS_STEPS } from '../../hooks/useTerminalBotAnalysis';
import { pairLabel } from '../../lib/botTradingPairs';
import { resolveBotAnalysisWhyLine } from '../../lib/botAnalysisDisplay';
import type { BotReadiness } from '../../lib/botReadiness';
import type { UnifiedSignal } from '../../lib/signalService';

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
  globalScanCount?: number;
  globalCoinsScanned?: number;
  readiness?: BotReadiness;
  openPositionsCount?: number;
  maxConcurrentPositions?: number;
  placement?: 'chart' | 'dock';
  pumpSweepLines?: string[];
};

const CYCLE_MS = 2400;
const TF_LINE_RE = /^(1m|5m|15m|1h|4h): /i;

function formatTfLine(tf: UnifiedSignal['timeframes'][number]) {
  return `${tf.timeframe} ${tf.direction} ${Math.round(tf.confidence)}%`;
}

function slidesFromSignal(signal: UnifiedSignal | null): string[] {
  if (signal?.timeframes?.length) {
    return signal.timeframes.map((tf) => formatTfLine(tf));
  }
  const fromReasons = signal?.reasons?.filter((r) => TF_LINE_RE.test(r.trim())) ?? [];
  if (fromReasons.length > 0) {
    return fromReasons.map((r) => r.replace(TF_LINE_RE, '').trim());
  }
  return [];
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
  readiness,
  openPositionsCount = 0,
  maxConcurrentPositions = 2,
  placement = 'chart',
  pumpSweepLines,
}) => {
  const [cycleIndex, setCycleIndex] = useState(0);
  const [slidePhase, setSlidePhase] = useState<'in' | 'out'>('in');
  const compact = placement === 'dock';

  const action = signal?.direction ?? dbAnalysis?.signal ?? 'HOLD';
  const conf = Math.round(signal?.confidence ?? dbAnalysis?.confidence ?? 0);
  const hasTfConflict = Boolean(signal?.warnings?.some((w) => /conflict/i.test(w)));
  const signalClass =
    action === 'LONG' ? 'term-pnl-pos' : action === 'SHORT' ? 'term-pnl-neg' : '';

  const hasData = Boolean(signal || dbAnalysis);
  const activeLabel = activeSymbol ? pairLabel(activeSymbol) : null;

  const tfSlides = useMemo(() => slidesFromSignal(signal), [signal]);
  const loadingSlides = useMemo(() => ANALYSIS_STEPS.map((s) => s.label), []);
  const cycleSlides = isLoading && !hasData ? loadingSlides : tfSlides;
  const slideCount = cycleSlides.length;

  const effectiveIndex =
    scanning && slideCount > 0 ? step % slideCount : cycleIndex % Math.max(slideCount, 1);

  const currentTf = cycleSlides[effectiveIndex] ?? null;

  useEffect(() => {
    setCycleIndex(0);
    setSlidePhase('in');
  }, [cycleSlides.join('|'), isLoading, hasData]);

  useEffect(() => {
    if (!visible || slideCount <= 1 || scanning) return;
    const id = setInterval(() => {
      setSlidePhase('out');
      window.setTimeout(() => {
        setCycleIndex((i) => (i + 1) % slideCount);
        setSlidePhase('in');
      }, 180);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [visible, slideCount, scanning, cycleSlides.join('|')]);

  useEffect(() => {
    if (!scanning || slideCount <= 1) return;
    setSlidePhase('out');
    const t = window.setTimeout(() => setSlidePhase('in'), 120);
    return () => clearTimeout(t);
  }, [scanning, step, slideCount]);

  const headline = useMemo(() => {
    const h = readiness?.headline ?? ANALYSIS_STEPS[step].label;
    if (h.startsWith('Checking ')) return h;
    if (h === 'Bot waiting' && !readiness?.detail?.trim()) return 'Scanning markets';
    return h;
  }, [readiness?.headline, readiness?.detail, step]);

  const whyLine = useMemo(
    () =>
      resolveBotAnalysisWhyLine({
        globalBest,
        readiness,
        hasTfConflict,
        openPositionsCount,
        maxConcurrentPositions,
        pumpSweepLines,
        signal,
        scanningCoin: activeSymbol,
      }),
    [
      globalBest,
      readiness,
      hasTfConflict,
      openPositionsCount,
      maxConcurrentPositions,
      pumpSweepLines,
      signal,
      activeSymbol,
    ]
  );

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
                <span>{headline}</span>
                {scanning ? (
                  <span className="hl-bot-analyzer-pill__meta">{Math.round(progress)}%</span>
                ) : null}
              </span>
            </div>
            {hasData || !isLoading ? (
              <div className="hl-bot-analyzer-pill">
                <span className="hl-bot-analyzer-pill__label">Signal</span>
                <span className={`hl-bot-analyzer-pill__value ${signalClass}`}>
                  {action} {conf}%
                  {hasTfConflict ? (
                    <span className="hl-bot-analyzer-pill__meta term-hint--warn"> mixed</span>
                  ) : null}
                </span>
              </div>
            ) : null}
            {activeLabel ? (
              <div className="hl-bot-analyzer-pill">
                <span className="hl-bot-analyzer-pill__label">Pair</span>
                <span className="hl-bot-analyzer-pill__value">{activeLabel}</span>
              </div>
            ) : null}
            {currentTf ? (
              <div className="hl-bot-analyzer-pill">
                <span className="hl-bot-analyzer-pill__label">TF</span>
                <span
                  className={`hl-bot-analyzer-pill__value hl-bot-analyzer-pill__value--muted ${
                    slidePhase === 'out' ? 'term-analysis-cycle-text--out' : ''
                  }`}
                  aria-live="polite"
                >
                  {currentTf}
                </span>
              </div>
            ) : null}
          </div>
          {whyLine ? (
            <p className="hl-bot-analyzer-subline term-analysis-subline--why">{whyLine}</p>
          ) : null}
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
        {whyLine ? (
          <p className="term-analysis-hint term-analysis-hint--subtle term-analysis-subline--why">
            {whyLine}
          </p>
        ) : null}
        <div className="term-analysis-meta">
          <span className={signalClass}>{action}</span>
          <span className="term-analysis-sep">·</span>
          <span title="Combined 1m+5m+15m+1h">{conf}% combined</span>
          {hasTfConflict ? (
            <>
              <span className="term-analysis-sep">·</span>
              <span className="term-hint--warn">mixed TFs</span>
            </>
          ) : null}
          {activeLabel ? (
            <>
              <span className="term-analysis-sep">·</span>
              <span>{activeLabel}</span>
            </>
          ) : null}
          {currentTf ? (
            <>
              <span className="term-analysis-sep">·</span>
              <span className="term-analysis-cycle-text">{currentTf}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default TerminalChartAnalysisOverlay;
