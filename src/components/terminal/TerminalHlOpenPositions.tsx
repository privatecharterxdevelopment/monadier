import React from 'react';
import type { HlPosition } from '../../lib/hyperliquid/user';
import {
  fmtLeverage,
  fmtPrice,
  fmtSize,
  fmtTradeUsdSymbol,
  fmtUsdSymbol,
  pnlToneClass,
} from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import { resolveDisplayLeverage } from '../../lib/hyperliquid/displayLeverage';
import { useHyperliquidMarkPrices } from '../../hooks/useHyperliquidMarkPrices';
import { useHlPositionPeakPnl } from '../../hooks/useHlPositionPeakPnl';
import { useHlBotTrailSnapshots } from '../../hooks/useHlBotTrailSnapshots';
import { HL_DEFAULT_STOP_LOSS_PERCENT } from '../../lib/hlBotConstants';
import { toBotTrailServerTruth, trailStopForOpenPosition } from '../../lib/hlTrailingStopChart';

type Props = {
  positions: HlPosition[];
  loading?: boolean;
  compact?: boolean;
  configuredLeverage?: number;
  stopLossMarginPct?: number;
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
  stopLossMarginPct = HL_DEFAULT_STOP_LOSS_PERCENT,
  walletAddress,
  reasonRefreshKey = 0,
  onCoinClick,
  onClose,
  closingCoin = null,
  closeBusy = false,
}) => {
  const coins = positions.map((p) => p.coin);
  const { prices: markPrices } = useHyperliquidMarkPrices(coins);

  const livePnlByCoin = Object.fromEntries(
    positions.map((p) => {
      const mark = markPrices[p.coin] ?? 0;
      const szi = Number.parseFloat(p.szi || '0');
      const entry = Number.parseFloat(p.entryPx || '0');
      const upnl =
        Number.parseFloat(p.unrealizedPnl || '0') ||
        (mark > 0 && szi ? (mark - entry) * szi : 0);
      return [p.coin, upnl];
    })
  );
  const peakPnlFor = useHlPositionPeakPnl(positions, livePnlByCoin);
  const botTrailByCoin = useHlBotTrailSnapshots(walletAddress, Boolean(walletAddress));

  if (loading && positions.length === 0) {
    return <p className="term-hl-open-empty">Loading Hyperliquid positions…</p>;
  }
  if (positions.length === 0) return null;

  return (
    <div className={`term-hl-open-block${compact ? ' term-hl-open-block--compact' : ''}`}>
      <div className="hl-dock-table-scroll">
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
            <th>Stop</th>
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
            const peakPnl = peakPnlFor(p.coin, entry, szi, upnl);
            const botTrail = botTrailByCoin[p.coin];
            const activeSl = trailStopForOpenPosition({
              entryPx: entry,
              szi,
              markPx: mark > 0 ? mark : entry,
              unrealizedPnlUsd: upnl,
              leverage: lev,
              coin: p.coin,
              peakPnlUsd: peakPnl,
              stopLossMarginPct,
              serverTrail: toBotTrailServerTruth(botTrail),
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
                <td className={pnlToneClass(upnl, 'term')}>
                  {upnl >= 0 ? '+' : ''}
                  {fmtUsd(upnl)}
                </td>
                <td
                  className={`term-hl-trail-col term-active-sl term-active-sl--${activeSl.kind}`}
                  title={activeSl.title}
                >
                  <span className="term-active-sl__price">{activeSl.label}</span>
                  {activeSl.sublabel ? (
                    <span className="term-active-sl__roe">{activeSl.sublabel}</span>
                  ) : null}
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
      <div className="hl-pos-cards term-hl-open-cards" aria-hidden={false}>
        {positions.map((p) => {
          const szi = toNum(p.szi);
          const isLong = szi >= 0;
          const mark = markPrices[p.coin] ?? 0;
          const upnl =
            toNum(p.unrealizedPnl) ||
            (mark > 0 && szi ? (mark - toNum(p.entryPx)) * szi : 0);
          const lev = resolveDisplayLeverage(configuredLeverage, p.leverage?.value);
          const isClosing = closingCoin === p.coin;
          const peakPnl = peakPnlFor(p.coin, toNum(p.entryPx), szi, upnl);
          const botTrail = botTrailByCoin[p.coin];
          const activeSl = trailStopForOpenPosition({
            entryPx: toNum(p.entryPx),
            szi,
            markPx: mark > 0 ? mark : toNum(p.entryPx),
            unrealizedPnlUsd: upnl,
            leverage: lev,
            coin: p.coin,
            peakPnlUsd: peakPnl,
            stopLossMarginPct,
            serverTrail: toBotTrailServerTruth(botTrail),
          });
          return (
            <article key={`card-${p.coin}`} className="hl-pos-card">
              <header className="hl-pos-card__head">
                {onCoinClick ? (
                  <button
                    type="button"
                    className="hl-coin-link"
                    onClick={() => onCoinClick(p.coin)}
                  >
                    {p.coin}
                  </button>
                ) : (
                  <strong>{p.coin}</strong>
                )}
                <span className={isLong ? 'hl-up' : 'hl-down'}>
                  {isLong ? 'LONG' : 'SHORT'} · {fmtLeverage(lev)}
                </span>
                <span className={pnlToneClass(upnl)}>{fmtTradeUsdSymbol(upnl)}</span>
              </header>
              <dl className="hl-pos-card__grid">
                <div>
                  <dt>Size</dt>
                  <dd>{fmtSize(Math.abs(szi))}</dd>
                </div>
                <div>
                  <dt>Value</dt>
                  <dd>{fmtUsdSymbol(p.positionValue)}</dd>
                </div>
                <div>
                  <dt>Entry</dt>
                  <dd>{fmtPrice(p.entryPx)}</dd>
                </div>
                <div>
                  <dt>Mark</dt>
                  <dd>{mark > 0 ? fmtPrice(mark) : '—'}</dd>
                </div>
                <div className="hl-pos-card__stop">
                  <dt>Stop</dt>
                  <dd className={`hl-active-sl hl-active-sl--${activeSl.kind}`}>
                    <span className="hl-active-sl__price">{activeSl.label}</span>
                    {activeSl.sublabel ? (
                      <span className="hl-active-sl__roe">{activeSl.sublabel}</span>
                    ) : null}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="hl-dock-action hl-pos-card__close"
                disabled={closeBusy || isClosing}
                onClick={() => onClose(p)}
              >
                {isClosing ? '…' : 'Close'}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default TerminalHlOpenPositions;
