import React, { useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { ANALYSIS_STEPS } from '../../hooks/useTerminalBotAnalysis';
import { pairLabel } from '../../lib/botTradingPairs';
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
  readiness?: BotReadiness;
};

const CYCLE_MS = 2400;
const TF_LINE_RE = /^(1m|5m|15m|1h|4h): /i;

function formatTfLine(tf: UnifiedSignal['timeframes'][number]) {
  return `${tf.timeframe}: ${tf.direction} (${Math.round(tf.confidence)}% conf, RSI: ${Math.round(tf.rsi)})`;
}

function slidesFromSignal(signal: UnifiedSignal | null): string[] {
  if (signal?.timeframes?.length) {
    return signal.timeframes.map((tf) => formatTfLine(tf));
  }
  const fromReasons =
    signal?.reasons?.filter((r) => TF_LINE_RE.test(r.trim())) ?? [];
  if (fromReasons.length > 0) return fromReasons;
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
  readiness,
}) => {
  const [cycleIndex, setCycleIndex] = useState(0);
  const [slidePhase, setSlidePhase] = useState<'in' | 'out'>('in');

  const action = signal?.direction ?? dbAnalysis?.signal ?? 'HOLD';
  const conf = Math.round(signal?.confidence ?? dbAnalysis?.confidence ?? 0);
  const hasTfConflict = Boolean(
    signal?.warnings?.some((w) => /conflict/i.test(w))
  );
  const signalClass =
    action === 'LONG' ? 'term-pnl-pos' : action === 'SHORT' ? 'term-pnl-neg' : '';

  const hasData = Boolean(signal || dbAnalysis);

  const activeLabel = activeSymbol ? pairLabel(activeSymbol) : null;

  const dataSlides = useMemo(() => {
    const fromSignal = slidesFromSignal(signal);
    if (fromSignal.length > 0) {
      return activeLabel
        ? fromSignal.map((line) => `${activeLabel} · ${line}`)
        : fromSignal;
    }
    if (dbAnalysis) {
      const parts = [`RSI ${Math.round(dbAnalysis.rsi)}`];
      if (dbAnalysis.pattern) parts.push(dbAnalysis.pattern);
      return [parts.join(' · ')];
    }
    return [];
  }, [signal, dbAnalysis, activeLabel]);

  const loadingSlides = useMemo(
    () => ANALYSIS_STEPS.map((s) => s.label),
    []
  );

  const cycleSlides = isLoading && !hasData ? loadingSlides : dataSlides;
  const slideCount = cycleSlides.length;

  const effectiveIndex =
    scanning && slideCount > 0
      ? step % slideCount
      : cycleIndex % Math.max(slideCount, 1);

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

  const rec =
    signal?.reasons?.[0] ||
    dbAnalysis?.recommendation?.split(' - ')[0] ||
    (isLoading && !hasData ? 'Initializing market analysis…' : 'Monitoring…');

  const currentSlide = cycleSlides[effectiveIndex] ?? rec;
  const showCycle = slideCount > 0;
  const showMetaSignal = hasData || !isLoading;

  return (
    <div className="term-chart-overlay">
      <div className="term-analysis-bar">
        {scanning && (
          <div className="term-analysis-bar-top">
            <Activity size={14} className="term-analysis-pulse" aria-hidden />
            <span className="term-analysis-step">
              {readiness?.headline ?? ANALYSIS_STEPS[step].label}
            </span>
            <div className="term-analysis-track">
              <div
                className="term-analysis-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="term-analysis-pct">{Math.round(progress)}%</span>
          </div>
        )}
        {scanning && readiness?.detail ? (
          <p className="term-analysis-hint">{readiness.detail}</p>
        ) : null}
        <div
          className={`term-analysis-meta ${showCycle ? 'term-analysis-meta--cycle' : ''}`}
        >
          {showCycle ? (
            <>
              {showMetaSignal && (
                <>
                  <span className={signalClass}>{action}</span>
                  <span className="term-analysis-sep">·</span>
                  <span>{conf}% bot conf.</span>
                  {hasTfConflict && (
                    <>
                      <span className="term-analysis-sep">·</span>
                      <span className="term-hint--warn" title="Timeframes disagree — bot waits for higher combined confidence">
                        mixed TFs
                      </span>
                    </>
                  )}
                  <span className="term-analysis-sep">·</span>
                </>
              )}
              <span className="term-analysis-cycle-slot" aria-live="polite">
                <span
                  key={`${effectiveIndex}-${currentSlide}`}
                  className={`term-analysis-cycle-text ${
                    slidePhase === 'out' ? 'term-analysis-cycle-text--out' : ''
                  } ${
                    scanning || (isLoading && !hasData)
                      ? 'term-analysis-cycle-text--scan'
                      : ''
                  }`}
                >
                  {currentSlide}
                </span>
              </span>
              {slideCount > 1 && (
                <span className="term-analysis-cycle-dots" aria-hidden>
                  {cycleSlides.map((_, i) => (
                    <span
                      key={i}
                      className={`term-analysis-cycle-dot ${
                        i === effectiveIndex ? 'term-analysis-cycle-dot--on' : ''
                      }`}
                    />
                  ))}
                </span>
              )}
            </>
          ) : (
            <>
              <span className={signalClass}>{action}</span>
              <span className="term-analysis-sep">·</span>
              <span>{conf}% conf.</span>
              <span className="term-analysis-sep">·</span>
              <span className="term-analysis-rec">{rec}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TerminalChartAnalysisOverlay;
