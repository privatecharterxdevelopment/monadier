import React, { useMemo } from 'react';
import type { HlMarket } from '../../lib/hyperliquid/markets';
import { fmtPct, fmtPrice } from '../../lib/hyperliquid/format';

type Props = {
  markets: HlMarket[];
  coin: string;
  onCoinChange: (coin: string) => void;
  resolveLabel?: (name: string) => string;
};

const ProTradeTickerStrip: React.FC<Props> = ({ markets, coin, onCoinChange, resolveLabel }) => {
  const tickers = useMemo(() => {
    return [...markets]
      .filter((m) => Number.isFinite(m.markPx) && m.markPx > 0)
      .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd);
  }, [markets]);

  if (tickers.length === 0) return null;

  const durationSec = Math.max(80, tickers.length * 2.8);

  const renderGroup = (keyPrefix: string, hidden: boolean) => (
    <div
      className="hl-ticker-group"
      role={hidden ? undefined : 'list'}
      aria-hidden={hidden || undefined}
    >
      {tickers.map((m) => {
        const up = m.change24hPct >= 0;
        return (
          <button
            key={`${keyPrefix}-${m.name}`}
            type="button"
            role={hidden ? undefined : 'listitem'}
            className={`hl-ticker-item ${coin === m.name ? 'hl-ticker-item--active' : ''}`}
            onClick={() => onCoinChange(m.name)}
            tabIndex={hidden ? -1 : undefined}
          >
            <span>{resolveLabel?.(m.name) ?? m.name}</span>
            <span>{fmtPrice(m.markPx, m.markPx >= 1000 ? 0 : 2)}</span>
            <span className={up ? 'hl-ticker-pct--up' : 'hl-ticker-pct--down'}>
              {fmtPct(m.change24hPct)}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="hl-ticker" aria-label="Market tickers">
      <div
        className="hl-ticker-track"
        style={{ ['--hl-ticker-duration' as string]: `${durationSec}s` }}
      >
        {renderGroup('a', false)}
        {renderGroup('b', true)}
      </div>
    </div>
  );
};

export default ProTradeTickerStrip;
