import React from 'react';
import type { HlPosition } from '../../lib/hyperliquid/user';

type Props = {
  positions: HlPosition[];
  livePnlUsd: number;
  loading?: boolean;
  compact?: boolean;
};

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPx(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 2 : 4 })}`;
}

const TerminalHlOpenPositions: React.FC<Props> = ({
  positions,
  livePnlUsd,
  loading = false,
  compact = false,
}) => {
  if (loading && positions.length === 0) {
    return <p className="term-hl-open-empty">Loading Hyperliquid positions…</p>;
  }
  if (positions.length === 0) return null;

  const pnlUp = livePnlUsd >= 0;

  return (
    <div className={`term-hl-open-block${compact ? ' term-hl-open-block--compact' : ''}`}>
      <div className={`term-hl-open-pnl${pnlUp ? ' term-hl-open-pnl--up' : ' term-hl-open-pnl--down'}`}>
        <span className="term-hl-open-pnl__label">Live uPnL</span>
        <strong>
          {pnlUp ? '+' : ''}
          {fmtUsd(livePnlUsd)}
        </strong>
        <span className="term-hl-open-pnl__meta">
          {positions.length} open on Hyperliquid · updates every 5s
        </span>
      </div>
      <table className="hl-table hl-table--positions term-hl-open-table">
        <thead>
          <tr>
            <th>Market</th>
            <th>Side</th>
            <th>Notional</th>
            <th>Entry</th>
            <th>Lev</th>
            <th>uPnL</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const szi = Number.parseFloat(p.szi || '0');
            const isLong = szi >= 0;
            const upnl = Number.parseFloat(p.unrealizedPnl || '0') || 0;
            const notional = Math.abs(Number.parseFloat(p.positionValue || '0') || 0);
            const entry = Number.parseFloat(p.entryPx || '0');
            const lev = p.leverage?.value ?? 1;
            return (
              <tr key={p.coin}>
                <td>
                  <strong>{p.coin}</strong>
                  <span className="term-dock-meta"> · HL</span>
                </td>
                <td>
                  <span className={isLong ? 'term-dir-long' : 'term-dir-short'}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                </td>
                <td>{fmtUsd(notional)}</td>
                <td>{fmtPx(entry)}</td>
                <td>{lev}x</td>
                <td className={upnl >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'}>
                  {upnl >= 0 ? '+' : ''}
                  {fmtUsd(upnl)}
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
