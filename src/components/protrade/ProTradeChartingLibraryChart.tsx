import React, { useEffect, useRef, useState } from 'react';
import type { HlInterval } from '../../lib/hyperliquid/types';
import { HyperliquidTvDatafeed } from '../../lib/hyperliquid/hlTvDatafeed';
import { resolveTradingViewInterval } from '../../lib/hyperliquid/tradingView';

type Props = {
  coin: string;
  interval: HlInterval;
};

type TvWidget = { remove: () => void };

const TV_LIBRARY_PATH = '/charting_library/';
const TV_STANDALONE_SCRIPT = `${TV_LIBRARY_PATH}charting_library.standalone.js`;

declare global {
  interface Window {
    TradingView?: {
      widget: new (opts: Record<string, unknown>) => TvWidget;
    };
  }
}

let tvClScriptPromise: Promise<boolean> | null = null;

function loadChartingLibrary(): Promise<boolean> {
  if (window.TradingView?.widget) return Promise.resolve(true);
  if (tvClScriptPromise) return tvClScriptPromise;

  tvClScriptPromise = new Promise((resolve) => {
    const existing = document.getElementById('tv-charting-library-script');
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.TradingView?.widget)), {
        once: true,
      });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'tv-charting-library-script';
    script.src = TV_STANDALONE_SCRIPT;
    script.async = true;
    script.onload = () => resolve(Boolean(window.TradingView?.widget));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return tvClScriptPromise;
}

const ProTradeChartingLibraryChart: React.FC<Props> = ({ coin, interval }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TvWidget | null>(null);
  const datafeedRef = useRef<HyperliquidTvDatafeed | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    let cancelled = false;
    datafeedRef.current = new HyperliquidTvDatafeed();

    void (async () => {
      const ok = await loadChartingLibrary();
      if (cancelled || !containerRef.current) return;

      if (!ok || !window.TradingView?.widget) {
        setUnavailable(true);
        return;
      }

      setUnavailable(false);
      widgetRef.current?.remove();
      el.innerHTML = '';

      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: coin,
        interval: resolveTradingViewInterval(interval),
        container: el.id,
        library_path: TV_LIBRARY_PATH,
        locale: 'en',
        theme: 'dark',
        timezone: 'Etc/UTC',
        datafeed: datafeedRef.current,
        disabled_features: ['use_localstorage_for_settings'],
        enabled_features: ['study_templates'],
        overrides: {
          'paneProperties.background': '#0b0b0b',
          'paneProperties.vertGridProperties.color': '#1a1a1a',
          'paneProperties.horzGridProperties.color': '#1a1a1a',
        },
      });
    })();

    return () => {
      cancelled = true;
      widgetRef.current?.remove();
      widgetRef.current = null;
      datafeedRef.current = null;
    };
  }, [coin, interval]);

  const containerId = `hl-tv-cl-${coin.replace(/[^a-zA-Z0-9]/g, '-')}-${interval}`;

  if (unavailable) {
    return (
      <div className="hl-chart-tv-wrap">
        <p className="hl-chart-empty" style={{ padding: 24 }}>
          HL Pro chart needs TradingView Charting Library in{' '}
          <code>public/charting_library/</code>. Use HL or TV mode meanwhile.
        </p>
      </div>
    );
  }

  return (
    <div className="hl-chart-tv-wrap">
      <p className="hl-chart-tv-note">Hyperliquid datafeed · TradingView Charting Library</p>
      <div ref={containerRef} id={containerId} className="hl-chart-tv-canvas" />
    </div>
  );
};

export default ProTradeChartingLibraryChart;
