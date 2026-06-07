import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { HlMarketSnapshot } from '../../lib/hyperliquid/types';
import type { HlMarket } from '../../lib/hyperliquid/markets';
import type { HlSpotMarketSnapshot } from '../../lib/hyperliquid/spot';
import { fmtPct, fmtPrice, fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import { useFundingCountdown } from '../../hooks/useFundingCountdown';
import ProTradeMarketPicker from './ProTradeMarketPicker';

type Props = {
  coin: string;
  markets: HlMarket[];
  marketsLoading?: boolean;
  snapshot: HlMarketSnapshot | HlSpotMarketSnapshot | null;
  loading: boolean;
  onCoinChange: (coin: string) => void;
  variant?: 'perp' | 'spot';
  displayName?: string;
  resolveLabel?: (name: string) => string;
};

function fmtVolShort(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  return fmtUsdSymbol(usd, 0);
}

const ProTradeMarketBar: React.FC<Props> = ({
  coin,
  markets,
  marketsLoading,
  snapshot,
  loading,
  onCoinChange,
  variant = 'perp',
  displayName,
  resolveLabel,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const fundingCd = useFundingCountdown();

  const change24h = toNum(snapshot?.change24hPct);
  const changeAbs = toNum(snapshot?.change24hAbs);
  const up = change24h >= 0;
  const markPx = toNum(snapshot?.markPx);
  const midPx = toNum(snapshot?.midPx);
  const oraclePx = toNum(snapshot?.oraclePx);

  return (
    <header className="hl-market-bar">
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className="hl-market-pair"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
        >
          {displayName ?? coin}{' '}
          <span className="hl-market-pair-tag">{variant === 'spot' ? 'Spot' : 'Perp'}</span>
          <ChevronDown size={14} />
        </button>
        {pickerOpen ? (
          <ProTradeMarketPicker
            coin={coin}
            markets={markets}
            loading={marketsLoading}
            onCoinChange={(name) => {
              onCoinChange(name);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
            variant="hl"
            resolveLabel={resolveLabel}
          />
        ) : null}
      </div>

      <div className="hl-market-stat">
        <span className="hl-market-stat-label">Mid</span>
        <span className="hl-market-stat-value">
          {loading && !snapshot ? '—' : fmtPrice(midPx, midPx >= 1000 ? 0 : 2)}
        </span>
      </div>
      <div className="hl-market-stat">
        <span className="hl-market-stat-label">Mark</span>
        <span className="hl-market-stat-value">
          {snapshot ? fmtPrice(markPx, markPx >= 1000 ? 0 : 2) : '—'}
        </span>
      </div>
      {variant === 'perp' ? (
        <div className="hl-market-stat">
          <span className="hl-market-stat-label">Oracle</span>
          <span className="hl-market-stat-value">
            {snapshot ? fmtPrice(oraclePx, oraclePx >= 1000 ? 0 : 2) : '—'}
          </span>
        </div>
      ) : null}
      <div className="hl-market-stat">
        <span className="hl-market-stat-label">24h Change</span>
        <span className={`hl-market-stat-value ${up ? 'hl-market-stat-value--up' : 'hl-market-stat-value--down'}`}>
          {snapshot
            ? `${changeAbs >= 0 ? '+' : ''}${fmtPrice(changeAbs, 0)} / ${fmtPct(change24h)}`
            : '—'}
        </span>
      </div>
      <div className="hl-market-stat">
        <span className="hl-market-stat-label">24h Volume</span>
        <span className="hl-market-stat-value">
          {snapshot ? fmtVolShort(snapshot.dayVolumeUsd) : '—'}
        </span>
      </div>
      {variant === 'perp' && 'openInterestUsd' in (snapshot ?? {}) ? (
        <div className="hl-market-stat">
          <span className="hl-market-stat-label">Open Interest</span>
          <span className="hl-market-stat-value">
            {snapshot ? fmtVolShort((snapshot as HlMarketSnapshot).openInterestUsd) : '—'}
          </span>
        </div>
      ) : null}
      {variant === 'perp' && 'fundingRate' in (snapshot ?? {}) ? (
        <div className="hl-market-stat">
          <span className="hl-market-stat-label">Funding / Countdown</span>
          <span className="hl-market-stat-value">
            {snapshot
              ? `${(toNum((snapshot as HlMarketSnapshot).fundingRate) * 100).toFixed(4)}% / ${fundingCd}`
              : '—'}
          </span>
        </div>
      ) : null}
    </header>
  );
};

export default ProTradeMarketBar;
