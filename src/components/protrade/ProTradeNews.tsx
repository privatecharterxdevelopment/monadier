import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Newspaper, RefreshCw } from 'lucide-react';
import { fetchNewsFeed, type NewsItemDto } from '../../lib/newsFeed';
import NewsCard from './news/NewsCard';
import ProTradePageShell from './ProTradePageShell';

type Tab = 'crypto' | 'sports';

type Props = {
  walletAddress?: string | null;
  onTradeCrypto?: (coin: string) => void;
  onTradeSports?: (outcomeId: number, eventName: string) => void;
};

const ProTradeNews: React.FC<Props> = ({ onTradeCrypto, onTradeSports }) => {
  const [tab, setTab] = useState<Tab>('crypto');
  const [items, setItems] = useState<NewsItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items: rows } = await fetchNewsFeed(tab, 28);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load news');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 120_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <ProTradePageShell className="hl-news-page">
      <section className="hl-studio-card">
        <header className="hl-studio-card__head hl-studio-card__head--split">
          <div className="hl-studio-card__head-text">
            <Newspaper size={18} aria-hidden />
            <div>
              <h1 className="hl-studio-card__title">News</h1>
              <p className="hl-studio-card__sub">
                CNBC, Reuters, Bloomberg, CoinDesk &amp; more — scanned for market impact.
              </p>
            </div>
          </div>
          <div className="hl-news-toolbar">
            <div className="hl-news-tabs" role="tablist" aria-label="News category">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'crypto'}
                className={`hl-news-tab ${tab === 'crypto' ? 'hl-news-tab--on' : ''}`}
                onClick={() => setTab('crypto')}
              >
                Crypto
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'sports'}
                className={`hl-news-tab ${tab === 'sports' ? 'hl-news-tab--on' : ''}`}
                onClick={() => setTab('sports')}
              >
                Sports
              </button>
            </div>
            <button
              type="button"
              className="hl-news-refresh"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh news"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden />
              Refresh
            </button>
          </div>
        </header>
      </section>

      <section className="hl-studio-card">
        <header className="hl-studio-card__head">
          <Newspaper size={18} aria-hidden />
          <span>Headlines</span>
        </header>
        <div className="hl-studio-card__body hl-studio-card__body--flush">
          {loading && items.length === 0 ? (
            <div className="hl-news-loading">
              <Loader2 size={20} className="animate-spin" aria-hidden />
              <span>Loading headlines…</span>
            </div>
          ) : null}

          {error ? <p className="hl-news-error">{error}</p> : null}

          <div className="hl-news-grid">
            {items.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                variant={tab}
                onTradeCrypto={onTradeCrypto}
                onTradeSports={onTradeSports}
              />
            ))}
          </div>

          {!loading && items.length === 0 && !error ? (
            <p className="hl-news-empty">No headlines in the last 48h — check back soon.</p>
          ) : null}
        </div>
      </section>
    </ProTradePageShell>
  );
};

export default ProTradeNews;
