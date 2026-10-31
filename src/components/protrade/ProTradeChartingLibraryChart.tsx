import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { HlInterval } from '../../lib/hyperliquid/types';
import { HyperliquidTvDatafeed } from '../../lib/hyperliquid/hlTvDatafeed';
import { resolveTradingViewInterval } from '../../lib/hyperliquid/tradingView';
import { loadChartingLibrary, TV_LIBRARY_PATH } from '../../lib/hyperliquid/chartingLibrary';
import type { ProTradeTheme } from '../../lib/proTradeTheme';
import { getProTradeChartColors } from '../../lib/proTradeTheme';

type Props = {
  coin: string;
  interval: HlInterval;
  theme: ProTradeTheme;
};

type TvWidget = { remove: () => void };

function safeRemoveWidget(widget: TvWidget | null | undefined) {
  if (!widget) return;
  try {
    widget.remove();
  } catch (e) {
    console.warn('[ChartingLibrary] widget.remove failed', e);
  }
}

const ProTradeChartingLibraryChart: React.FC<Props> = ({ coin, interval, theme }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TvWidget | null>(null);
  const datafeedRef = useRef<HyperliquidTvDatafeed | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const containerId = useId().replace(/:/g, '');

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
      safeRemoveWidget(widgetRef.current);
      el.innerHTML = '';

      const colors = getProTradeChartColors(theme);

      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: coin,
        interval: resolveTradingViewInterval(interval),
        container: el.id,
        library_path: TV_LIBRARY_PATH,
        locale: 'en',
        theme: theme === 'light' ? 'light' : 'dark',
        timezone: 'Etc/UTC',
        datafeed: datafeedRef.current,
        disabled_features: ['use_localstorage_for_settings', 'header_symbol_search'],
        enabled_features: [
          'study_templates',
          'side_toolbar_in_fullscreen_mode',
          'header_chart_type',
          'header_settings',
          'header_undo_redo',
          'header_screenshot',
        ],
        overrides: {
          'paneProperties.background': colors.background,
          'paneProperties.vertGridProperties.color': colors.grid,
          'paneProperties.horzGridProperties.color': colors.grid,
        },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [coin, interval, theme, containerId]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    return () => {
      safeRemoveWidget(widgetRef.current);
      widgetRef.current = null;
      datafeedRef.current = null;
      if (el) {
        try {
          el.innerHTML = '';
        } catch {
          /* React may have already detached the node */
        }
      }
    };
  }, [coin, interval, theme, containerId]);

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
