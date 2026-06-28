import React, { useEffect, useState } from 'react';
import {
  getChartDebugEvents,
  isChartDebugEnabled,
  subscribeChartDebug,
  type ChartDebugEvent,
} from '../../lib/hyperliquid/chartDebug';

export type ChartHealthSnapshot = {
  coin: string;
  interval: string;
  loading: boolean;
  rawCount: number;
  displayCount: number;
  dropped: number;
  usedFallback: boolean;
  containerW: number;
  containerH: number;
  blankReason: string | null;
  wsConnected?: boolean;
  error?: string | null;
  fetchAttempts?: number;
};

type Props = {
  health: ChartHealthSnapshot;
  onRetry?: () => void;
  /** Show overlay when chart is blank even if debug mode is off. */
  forceVisible?: boolean;
};

function fmtEvent(e: ChartDebugEvent): string {
  const t = new Date(e.ts).toLocaleTimeString();
  const detail = e.data ? ` ${JSON.stringify(e.data)}` : '';
  return `${t} ${e.scope}/${e.event}${detail}`;
}

const ChartDebugOverlay: React.FC<Props> = ({ health, onRetry, forceVisible = false }) => {
  const [events, setEvents] = useState<ChartDebugEvent[]>(() => getChartDebugEvents());
  const debugOn = isChartDebugEnabled();

  useEffect(() => subscribeChartDebug(() => setEvents(getChartDebugEvents())), []);

  const visible = debugOn || forceVisible;
  if (!visible) return null;

  const recent = events.slice(-6).reverse();

  return (
    <div className="hl-chart-debug" role="status" aria-live="polite">
      <div className="hl-chart-debug__head">
        <span className="hl-chart-debug__title">Chart debug</span>
        {health.blankReason ? (
          <span className="hl-chart-debug__reason">{health.blankReason}</span>
        ) : (
          <span className="hl-chart-debug__ok">rendering</span>
        )}
        {onRetry ? (
          <button type="button" className="hl-chart-debug__retry" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
      <div className="hl-chart-debug__grid">
        <span>{health.coin} · {health.interval}</span>
        <span>
          bars {health.displayCount}/{health.rawCount}
          {health.dropped > 0 ? ` (−${health.dropped})` : ''}
          {health.usedFallback ? ' · fallback' : ''}
        </span>
        <span>
          canvas {health.containerW}×{health.containerH}
        </span>
        <span>
          {health.loading ? 'loading' : 'idle'}
          {health.wsConnected ? ' · ws' : ''}
          {health.fetchAttempts ? ` · fetch×${health.fetchAttempts}` : ''}
        </span>
        {health.error ? <span className="hl-chart-debug__err">{health.error}</span> : null}
      </div>
      {debugOn && recent.length > 0 ? (
        <ul className="hl-chart-debug__log">
          {recent.map((e, i) => (
            <li key={`${e.ts}-${i}`}>{fmtEvent(e)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export default ChartDebugOverlay;
