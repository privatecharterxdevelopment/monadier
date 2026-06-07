import React, { useMemo, useState } from 'react';
import type { HlL2Book, HlRecentTrade } from '../../lib/hyperliquid/types';
import { fmtPrice, fmtSize, fmtTimeMs } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';

type Props = {
  book: HlL2Book | null;
  recentTrades: HlRecentTrade[];
  markPx: number;
  coin: string;
  onPriceClick?: (price: number) => void;
};

const DEPTH = 14;

type BookRow = { px: string; sz: string; cum: number };

const ProTradeOrderBook: React.FC<Props> = ({
  book,
  recentTrades,
  markPx,
  coin,
  onPriceClick,
}) => {
  const [tab, setTab] = useState<'book' | 'trades'>('book');

  const { asks, bids, spread } = useMemo(() => {
    if (!book) return { asks: [] as BookRow[], bids: [] as BookRow[], spread: null as number | null };

    const rawAsks = book.levels?.[1] ?? [];
    const rawBids = book.levels?.[0] ?? [];

    let askCum = 0;
    const asks = rawAsks.slice(0, DEPTH).map((level) => {
      askCum += toNum(level.sz);
      return { px: level.px, sz: level.sz, cum: askCum };
    }).reverse();

    let bidCum = 0;
    const bids = rawBids.slice(0, DEPTH).map((level) => {
      bidCum += toNum(level.sz);
      return { px: level.px, sz: level.sz, cum: bidCum };
    });

    const bestAsk = rawAsks[0] ? toNum(rawAsks[0].px) : null;
    const bestBid = rawBids[0] ? toNum(rawBids[0].px) : null;
    const spread =
      bestAsk != null && bestBid != null && bestBid > 0
        ? ((bestAsk - bestBid) / bestBid) * 100
        : null;

    return { asks, bids, spread };
  }, [book]);

  const maxCum = useMemo(() => {
    const all = [...asks, ...bids].map((l) => l.cum);
    return Math.max(...all, 0.0001);
  }, [asks, bids]);

  const handleClick = (px: string) => {
    const n = toNum(px);
    if (n > 0) onPriceClick?.(n);
  };

  return (
    <aside className="hl-book">
      <div className="hl-book-tabs">
        <button
          type="button"
          className={`hl-book-tab ${tab === 'book' ? 'hl-book-tab--on' : ''}`}
          onClick={() => setTab('book')}
        >
          Order Book
        </button>
        <button
          type="button"
          className={`hl-book-tab ${tab === 'trades' ? 'hl-book-tab--on' : ''}`}
          onClick={() => setTab('trades')}
        >
          Trade History
        </button>
      </div>

      {tab === 'book' ? (
        <>
          <div className="hl-book-cols">
            <span>Price</span>
            <span>Amount ({coin})</span>
            <span>Total</span>
          </div>
          <div className="hl-book-scroll">
            <div>
              {asks.map((level) => {
                const pct = (level.cum / maxCum) * 100;
                return (
                  <button
                    key={`a-${level.px}`}
                    type="button"
                    className="hl-book-row hl-book-row--ask"
                    onClick={() => handleClick(level.px)}
                  >
                    <span className="hl-book-depth" style={{ width: `${pct}%` }} aria-hidden />
                    <span>{fmtPrice(level.px, 0)}</span>
                    <span>{fmtSize(level.sz)}</span>
                    <span>{fmtSize(level.cum)}</span>
                  </button>
                );
              })}
            </div>
            <div className="hl-book-mid">
              {markPx > 0 ? fmtPrice(markPx, 0) : '—'}
              {spread != null ? (
                <span style={{ fontSize: 10, color: '#71717a', marginLeft: 6 }}>
                  Spread {spread.toFixed(2)}%
                </span>
              ) : null}
            </div>
            <div>
              {bids.map((level) => {
                const pct = (level.cum / maxCum) * 100;
                return (
                  <button
                    key={`b-${level.px}`}
                    type="button"
                    className="hl-book-row hl-book-row--bid"
                    onClick={() => handleClick(level.px)}
                  >
                    <span className="hl-book-depth" style={{ width: `${pct}%` }} aria-hidden />
                    <span>{fmtPrice(level.px, 0)}</span>
                    <span>{fmtSize(level.sz)}</span>
                    <span>{fmtSize(level.cum)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="hl-book-foot">
            <span>ALL</span>
            <span>BUYS</span>
            <span>SELLS</span>
            <span style={{ marginLeft: 'auto' }}>{coin}</span>
          </div>
        </>
      ) : (
        <>
          <div className="hl-book-cols">
            <span>Price</span>
            <span>Size</span>
            <span>Time</span>
          </div>
          <div className="hl-book-scroll">
            {recentTrades.length === 0 ? (
              <p className="hl-dock-empty">No recent trades</p>
            ) : (
              recentTrades.map((t, i) => (
                <div
                  key={`${t.time}-${i}`}
                  className={`hl-book-row ${t.side === 'B' ? 'hl-book-row--bid' : 'hl-book-row--ask'}`}
                  style={{ cursor: 'default' }}
                >
                  <span>{fmtPrice(t.px, 0)}</span>
                  <span>{fmtSize(t.sz)}</span>
                  <span style={{ color: '#71717a' }}>{fmtTimeMs(t.time)}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </aside>
  );
};

export default ProTradeOrderBook;
