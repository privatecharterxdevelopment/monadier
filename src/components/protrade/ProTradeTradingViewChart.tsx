import React, { useEffect, useRef } from 'react';
import type { HlInterval } from '../../lib/hyperliquid/types';
import { resolveTradingViewInterval, resolveTradingViewSymbol } from '../../lib/hyperliquid/tradingView';
import type { ProTradeTheme } from '../../lib/proTradeTheme';
import { getProTradeChartColors } from '../../lib/proTradeTheme';

type Props = {
  coin: string;
  interval: HlInterval;
  theme: ProTradeTheme;
  hideNote?: boolean;
};

type TvWidget = { remove: () => void };

declare global {
  interface Window {
    TradingView?: {
      widget: new (opts: Record<string, unknown>) => TvWidget;
    };
  }
}

let tvScriptPromise: Promise<void> | null = null;

function loadTradingViewScript(): Promise<void> {
  if (window.TradingView?.widget) return Promise.resolve();
  if (tvScriptPromise) return tvScriptPromise;

  tvScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('tradingview-widget-script');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('TradingView script failed')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = 'tradingview-widget-script';
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('TradingView script failed'));
    document.head.appendChild(script);
  });

  return tvScriptPromise;
}

const ProTradeTradingViewChart: React.FC<Props> = ({ coin, interval, theme, hideNote }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TvWidget | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    let cancelled = false;

    void (async () => {
      try {
        await loadTradingViewScript();
        if (cancelled || !containerRef.current || !window.TradingView?.widget) return;

        widgetRef.current?.remove();
        el.innerHTML = '';

        const colors = getProTradeChartColors(theme);

        widgetRef.current = new window.TradingView.widget({
          autosize: true,
          symbol: resolveTradingViewSymbol(coin),
          interval: resolveTradingViewInterval(interval),
          timezone: 'Etc/UTC',
          theme: theme === 'light' ? 'light' : 'dark',
          style: '1',
          locale: 'en',
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: el.id,
          studies: [],
          backgroundColor: colors.background,
          gridColor: colors.grid,
        });
      } catch {
        if (!cancelled && el) {
          el.innerHTML = '<p class="hl-chart-empty">TradingView unavailable</p>';
        }
      }
    })();

    return () => {
      cancelled = true;
      widgetRef.current?.remove();
      widgetRef.current = null;
    };
  }, [coin, interval, theme]);

  const containerId = `tv-${coin.replace(/[^a-zA-Z0-9]/g, '-')}-${interval}`;

  return (
    <div className="hl-chart-tv-wrap">
      {hideNote ? null : (
        <p className="hl-chart-tv-note">
          TradingView uses external exchange data — prices may differ from Hyperliquid.
        </p>
      )}
      <div ref={containerRef} id={containerId} className="hl-chart-tv-canvas" />
    </div>
  );
};

export default ProTradeTradingViewChart;
