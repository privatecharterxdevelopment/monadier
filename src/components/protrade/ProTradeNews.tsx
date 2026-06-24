import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Newspaper, RefreshCw, Shield } from 'lucide-react';
import { fetchNewsFeed, type NewsItemDto } from '../../lib/newsFeed';
import {
  NEWS_TRADE_MODE_HINTS,
  NEWS_TRADE_MODE_LABELS,
  normalizeNewsTradeMode,
  type NewsTradeMode,
} from '../../lib/newsTradeMode';
import { saveNewsTradeMode } from '../../lib/saveNewsTradeMode';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import NewsCard from './news/NewsCard';
import ProTradePageShell from './ProTradePageShell';

type Tab = 'crypto' | 'sports';

type Props = {
  walletAddress?: string | null;
  onTradeCrypto?: (coin: string) => void;
  onTradeSports?: (outcomeId: number, eventName: string) => void;
};

const MODES: NewsTradeMode[] = ['off', 'filter', 'boost'];

const ProTradeNews: React.FC<Props> = ({ walletAddress, onTradeCrypto, onTradeSports }) => {
  const [tab, setTab] = useState<Tab>('crypto');
  const [items, setItems] = useState<NewsItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const { settings, wallet } = useTerminalBotSettings();
  const effectiveWallet = walletAddress ?? wallet;
  const [localMode, setLocalMode] = useState<NewsTradeMode>(settings.newsTradeMode ?? 'filter');
  const newsMode = localMode;

  useEffect(() => {
    setLocalMode(settings.newsTradeMode ?? 'filter');
  }, [settings.newsTradeMode]);

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

  const setMode = async (mode: NewsTradeMode) => {
    if (!effectiveWallet || normalizeNewsTradeMode(mode) === newsMode) return;
    setSavingMode(true);
    try {
      await saveNewsTradeMode(effectiveWallet, mode);
      setLocalMode(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save bot news mode');
    } finally {
      setSavingMode(false);
    }
  };

  return (
    <ProTradePageShell className="hl-news-page">
      <div className="hl-news-top">
        <div className="hl-news-head">
          <div className="hl-news-head__icon" aria-hidden>
            <Newspaper size={20} />
          </div>
          <div>
            <h1 className="hl-news-head__title">News</h1>
            <p className="hl-news-head__lead">
              Headlines from CNBC, Reuters, Bloomberg, CoinDesk &amp; more — scanned for market impact.
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
      </div>

      <section className="hl-news-bot-mode" aria-label="Bot news mode">
        <div className="hl-news-bot-mode__head">
          <Shield size={16} aria-hidden />
          <span>Bot news mode</span>
          {savingMode ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
        </div>
        <div className="hl-news-mode-pills">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`hl-news-mode-pill ${newsMode === mode ? 'hl-news-mode-pill--on' : ''}`}
              disabled={!effectiveWallet || savingMode}
              title={NEWS_TRADE_MODE_HINTS[mode]}
              onClick={() => void setMode(mode)}
            >
              {NEWS_TRADE_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        <p className="hl-news-bot-mode__hint">{NEWS_TRADE_MODE_HINTS[newsMode]}</p>
        {!effectiveWallet ? (
          <p className="hl-news-bot-mode__warn">Connect wallet to save bot news mode.</p>
        ) : null}
      </section>

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
    </ProTradePageShell>
  );
};

export default ProTradeNews;
