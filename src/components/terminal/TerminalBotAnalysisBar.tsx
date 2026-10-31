import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ARBITRUM_ONE_CHAIN_ID } from '../../lib/usdcArbitrum';

const ANALYSIS_STEPS = [
  { label: 'Scanning 1m chart', progress: 15 },
  { label: 'Analyzing 5m trends', progress: 35 },
  { label: 'Checking 15m patterns', progress: 55 },
  { label: 'Evaluating 1h momentum', progress: 75 },
  { label: 'Combining signals', progress: 95 },
] as const;

type AnalysisRow = {
  signal: string;
  confidence: number;
  rsi: number;
  trend: string;
  pattern: string | null;
  recommendation: string;
};

type Props = {
  active?: boolean;
};

const TerminalBotAnalysisBar: React.FC<Props> = ({ active = false }) => {
  const [analysis, setAnalysis] = useState<AnalysisRow | null>(null);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(ANALYSIS_STEPS[0].progress);

  useEffect(() => {
    if (!active) {
      setStep(0);
      setProgress(ANALYSIS_STEPS[0].progress);
      return;
    }

    const tick = setInterval(() => {
      setStep((prev) => {
        const next = (prev + 1) % ANALYSIS_STEPS.length;
        setProgress(ANALYSIS_STEPS[next].progress);
        return next;
      });
    }, 2000);

    return () => clearInterval(tick);
  }, [active]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('bot_analysis')
          .select('signal, confidence, rsi, trend, pattern, recommendation, updated_at')
          .eq('chain_id', ARBITRUM_ONE_CHAIN_ID)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) setAnalysis(data as AnalysisRow);
      } catch {
        /* table may be empty */
      }
    };

    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  if (!active) return null;

  return (
    <div className="term-analysis-bar">
      <div className="term-analysis-bar-top">
        <Activity size={14} className="term-analysis-pulse" aria-hidden />
        <span className="term-analysis-step">{ANALYSIS_STEPS[step].label}</span>
        <div className="term-analysis-track">
          <div className="term-analysis-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="term-analysis-pct">{Math.round(progress)}%</span>
      </div>
      <div className="term-analysis-meta">
        {analysis ? (
          <>
            <span
              className={
                analysis.signal === 'LONG'
                  ? 'term-pnl-pos'
                  : analysis.signal === 'SHORT'
                    ? 'term-pnl-neg'
                    : ''
              }
            >
              {analysis.signal}
            </span>
            <span className="term-analysis-sep">·</span>
            <span>{analysis.confidence}% conf.</span>
            <span className="term-analysis-sep">·</span>
            <span>RSI {analysis.rsi}</span>
            {analysis.pattern && (
              <>
                <span className="term-analysis-sep">·</span>
                <span>{analysis.pattern}</span>
              </>
            )}
            <span className="term-analysis-sep">·</span>
            <span className="term-analysis-rec">
              {analysis.recommendation?.split(' - ')[0] || 'Monitoring…'}
            </span>
          </>
        ) : (
          <span>Initializing market analysis…</span>
        )}
      </div>
    </div>
  );
};

export default TerminalBotAnalysisBar;
