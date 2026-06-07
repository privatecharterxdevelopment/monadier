import React from 'react';
import type { HlMarket } from '../../lib/hyperliquid/markets';
import { fmtPct, fmtPrice } from '../../lib/hyperliquid/format';

type Props = {
  markets: HlMarket[];
  coin: string;
  onCoinChange: (coin: string) => void;
  resolveLabel?: (name: string) => string;
};

const ProTradeTickerStrip: React.FC<Props> = ({ markets, coin, onCoinChange, resolveLabel }) => {
  const tickers = markets.slice(0, 12);

  if (tickers.length === 0) return null;

  return (
    <div className="hl-ticker" role="list" aria-label="Market tickers">
      {tickers.map((m) => {
        const up = m.change24hPct >= 0;
        return (
          <button
            key={m.name}
            type="button"
            role="listitem"
            className={`hl-ticker-item ${coin === m.name ? 'hl-ticker-item--active' : ''}`}
            onClick={() => onCoinChange(m.name)}
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
};

export default ProTradeTickerStrip;
