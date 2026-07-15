import React, { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ensureArray } from '../../lib/ensureArray';
import type { HlL2Book, HlRecentTrade } from '../../lib/hyperliquid/types';
import { fmtMarketPrice, fmtSize, fmtTimeMs } from '../../lib/hyperliquid/format';
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

type BookLevelRowProps = {
  level: BookRow;
  side: 'ask' | 'bid';
  maxCum: number;
  onPriceClick?: (price: number) => void;
};

const BookLevelRow = memo(function BookLevelRow({
  level,
  side,
  maxCum,
  onPriceClick,
}: BookLevelRowProps) {
  const pct = (level.cum / maxCum) * 100;

  return (
    <button
      type="button"
      className={`hl-book-row hl-book-row--${side}`}
      style={{ '--book-depth': `${pct}%` } as React.CSSProperties}
      onClick={() => {
        const n = toNum(level.px);
        if (n > 0) onPriceClick?.(n);
      }}
    >
      <span className="hl-book-depth" aria-hidden />
      <span>{fmtMarketPrice(level.px)}</span>
      <span>{fmtSize(level.sz)}</span>
      <span>{fmtSize(level.cum)}</span>
    </button>
  );
});

const ProTradeOrderBook: React.FC<Props> = ({
  book,
  recentTrades,
  markPx,
  coin,
  onPriceClick,
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'book' | 'trades'>('book');

  const tape = useMemo(
    () =>
      recentTrades
        .filter((t) => t.coin.trim().toUpperCase() === coin.trim().toUpperCase())
        .slice(0, 50),
    [recentTrades, coin]
  );

  const { asks, bids, spread } = useMemo(() => {
    if (!book) return { asks: [] as BookRow[], bids: [] as BookRow[], spread: null as number | null };

    const rawAsks = ensureArray(book.levels?.[1]);
    const rawBids = ensureArray(book.levels?.[0]);

    let askCum = 0;
    const asks = rawAsks
      .slice(0, DEPTH)
      .map((level) => {
        askCum += toNum(level.sz);
        return { px: level.px, sz: level.sz, cum: askCum };
      })
      .reverse();

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

  return (
    <aside className="hl-book">
      <div className="hl-book-tabs">
        <button
          type="button"
          className={`hl-book-tab ${tab === 'book' ? 'hl-book-tab--on' : ''}`}
          onClick={() => setTab('book')}
        >
          {t('trading.book.orderBook')}
        </button>
        <button
          type="button"
          className={`hl-book-tab ${tab === 'trades' ? 'hl-book-tab--on' : ''}`}
          onClick={() => setTab('trades')}
        >
          {t('trading.book.recentTrades')}
        </button>
      </div>

      {tab === 'book' ? (
        <>
          <div className="hl-book-cols">
            <span>{t('trading.order.price')}</span>
            <span>{t('trading.book.amount', { coin })}</span>
            <span>{t('trading.book.total')}</span>
          </div>
          <div className="hl-book-scroll">
            <div className="hl-book-side hl-book-side--asks">
              {asks.map((level) => (
                <BookLevelRow
                  key={`a-${level.px}`}
                  level={level}
                  side="ask"
                  maxCum={maxCum}
                  onPriceClick={onPriceClick}
                />
              ))}
            </div>
            <div className="hl-book-mid">
              {markPx > 0 ? fmtMarketPrice(markPx) : '—'}
              {spread != null ? (
                <span className="hl-book-spread">
                  {t('trading.book.spread', { pct: spread.toFixed(2) })}
                </span>
              ) : null}
            </div>
            <div className="hl-book-side hl-book-side--bids">
              {bids.map((level) => (
                <BookLevelRow
                  key={`b-${level.px}`}
                  level={level}
                  side="bid"
                  maxCum={maxCum}
                  onPriceClick={onPriceClick}
                />
              ))}
            </div>
          </div>
          <div className="hl-book-foot">
            <span>{t('trading.book.all')}</span>
            <span>{t('trading.book.buys')}</span>
            <span>{t('trading.book.sells')}</span>
            <span className="hl-book-foot-coin">{coin}</span>
          </div>
        </>
      ) : (
        <>
          <div className="hl-book-cols">
            <span>{t('trading.order.price')}</span>
            <span>{t('trading.order.size')}</span>
            <span>{t('dock.cols.time')}</span>
          </div>
          <div className="hl-book-scroll hl-book-scroll--tape">
            {tape.length === 0 ? (
              <p className="hl-dock-empty">{t('trading.book.noTrades')}</p>
            ) : (
              tape.map((tr, i) => (
                <div
                  key={`${tr.time}-${i}`}
                  className={`hl-book-row hl-book-row--static ${tr.side === 'B' ? 'hl-book-row--bid' : 'hl-book-row--ask'}`}
                >
                  <span>{fmtMarketPrice(tr.px)}</span>
                  <span>{fmtSize(tr.sz)}</span>
                  <span className="hl-book-time-muted">{fmtTimeMs(tr.time)}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </aside>
  );
};

export default memo(ProTradeOrderBook);
