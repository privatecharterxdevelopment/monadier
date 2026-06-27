import React from 'react';
import type { HlPosition } from '../../lib/hyperliquid/user';
import { fmtTradeUsdSymbol } from '../../lib/hyperliquid/format';
import { resolveDisplayLeverage } from '../../lib/hyperliquid/displayLeverage';
import { useHyperliquidMarkPrices } from '../../hooks/useHyperliquidMarkPrices';
import { trailStopForOpenPosition } from '../../lib/hlTrailingStopChart';

type Props = {
  positions: HlPosition[];
  loading?: boolean;
  compact?: boolean;
  configuredLeverage?: number;
  walletAddress?: string | null;
  reasonRefreshKey?: number;
  /** Switch the live chart to this HL perp coin. */
  onCoinClick?: (coin: string) => void;
  onClose: (position: HlPosition) => void;
  closingCoin?: string | null;
  closeBusy?: boolean;
};

function fmtUsd(n: number) {
  return fmtTradeUsdSymbol(n);
}

function fmtPx(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 2 : 4 })}`;
}

const TerminalHlOpenPositions: React.FC<Props> = ({
  positions,
  loading = false,
  compact = false,
  configuredLeverage,
  walletAddress,
  reasonRefreshKey = 0,
  onCoinClick,
  onClose,
  closingCoin = null,
  closeBusy = false,
}) => {
  const coins = positions.map((p) => p.coin);
  const { prices: markPrices } = useHyperliquidMarkPrices(coins);

  if (loading && positions.length === 0) {
    return <p className="term-hl-open-empty">Loading Hyperliquid positions…</p>;
  }
  if (positions.length === 0) return null;

  return (
    <div className={`term-hl-open-block${compact ? ' term-hl-open-block--compact' : ''}`}>
      <table className="hl-table hl-table--positions term-hl-open-table">
        <thead>
          <tr>
            <th>Market</th>
            <th>Side</th>
            <th>Notional</th>
            <th>Entry</th>
            <th>Mark</th>
            <th>Lev</th>
            <th>uPnL</th>
            <th>Trail SL</th>
            <th className="term-hl-open-actions-col">Close</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const szi = Number.parseFloat(p.szi || '0');
            const isLong = szi >= 0;
            const upnl = Number.parseFloat(p.unrealizedPnl || '0') || 0;
            const notional = Math.abs(Number.parseFloat(p.positionValue || '0') || 0);
            const entry = Number.parseFloat(p.entryPx || '0');
            const mark = markPrices[p.coin] ?? 0;
            const lev = resolveDisplayLeverage(configuredLeverage, p.leverage?.value);
            const isClosing = closingCoin === p.coin;
            const trail = trailStopForOpenPosition({
              entryPx: entry,
              szi,
              markPx: mark > 0 ? mark : entry,
              unrealizedPnlUsd: upnl,
              leverage: lev,
              coin: p.coin,
            });
            return (
              <tr key={p.coin}>
                <td>
                  <span className="term-hl-open-market">
                    {onCoinClick ? (
                      <button
                        type="button"
                        className="hl-coin-link term-hl-open-market__link"
                        onClick={() => onCoinClick(p.coin)}
                      >
                        {p.coin}
                      </button>
                    ) : (
                      <strong>{p.coin}</strong>
                    )}
                  </span>
                  <span className="term-dock-meta"> · HL</span>
                </td>
                <td>
                  <span className={isLong ? 'term-dir-long' : 'term-dir-short'}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                </td>
                <td>{fmtUsd(notional)}</td>
                <td>{fmtPx(entry)}</td>
                <td>{fmtPx(mark)}</td>
                <td>{lev}x</td>
                <td className={upnl >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'}>
                  {upnl >= 0 ? '+' : ''}
                  {fmtUsd(upnl)}
                </td>
                <td
                  className="term-hl-trail-col"
                  title={
                    trail.armed
                      ? 'Bot-managed dynamic trail — closes at market when price crosses'
                      : 'Trail arms after +2.5% ROE in profit (~7 min hold)'
                  }
                >
                  {trail.label}
                </td>
                <td className="term-dock-actions term-hl-open-actions-col">
                  <button
                    type="button"
                    className="term-dock-close-btn"
                    disabled={closeBusy || isClosing}
                    onClick={() => onClose(p)}
                    title="Close position — bot keeps running"
                  >
                    {isClosing ? '…' : 'Close'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TerminalHlOpenPositions;
