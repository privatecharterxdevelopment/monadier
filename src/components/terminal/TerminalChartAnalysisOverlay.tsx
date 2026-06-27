import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { ANALYSIS_STEPS } from '../../hooks/useTerminalBotAnalysis';
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

const TerminalChartAnalysisOverlay: React.FC<Props> = ({
  scanning,
  step,
  readiness,
  placement = 'chart',
}) => {
  const compact = placement === 'dock';

  const headline = useMemo(() => {
    const h = readiness?.headline ?? ANALYSIS_STEPS[step].label;
    if (h.startsWith('Checking ')) return 'Scanning markets';
    if (h === 'Bot waiting' || h === 'Opening trade') return 'Scanning markets';
    return h;
  }, [readiness?.headline, step]);

  if (!scanning) return null;

  if (compact) {
    return (
      <div className="term-dock-analysis">
        <div className="term-analysis-bar term-analysis-bar--compact hl-bot-analyzer-bar">
          <div className="hl-bot-analyzer-pills">
            <div className="hl-bot-analyzer-pill">
              <span className="hl-bot-analyzer-pill__label">Status</span>
              <span className="hl-bot-analyzer-pill__value hl-bot-analyzer-pill__value--row">
                <Activity size={11} className="term-analysis-pulse" aria-hidden />
                <span>{headline}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="term-chart-overlay">
      <div className="term-analysis-bar">
        <div className="term-analysis-bar-top">
          <Activity size={14} className="term-analysis-pulse" aria-hidden />
          <span className="term-analysis-step">{headline}</span>
        </div>
      </div>
    </div>
  );
};

export default TerminalChartAnalysisOverlay;
