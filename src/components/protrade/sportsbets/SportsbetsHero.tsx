import React from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import { BETTING_CATEGORY_TABS } from '../../../lib/hyperliquid/outcomes/categories';
import type { BettingCategoryId } from '../../../lib/hyperliquid/outcomes/categories';
import BettingCategoryNav from './BettingCategoryNav';

type Props = {
  syncing?: boolean;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  category: BettingCategoryId;
  categoryCounts: Record<BettingCategoryId, number>;
  onCategoryChange: (id: BettingCategoryId) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

const SportsbetsHero: React.FC<Props> = ({
  syncing,
  onRefresh,
  refreshDisabled,
  category,
  categoryCounts,
  onCategoryChange,
  searchQuery,
  onSearchChange,
}) => (
  <header className="hl-sb-head">
    <div
      className="hl-sb-head-bg"
      style={{ backgroundImage: "url('/images/betting/world-cup-hero.png')" }}
      aria-hidden
    />
    <div className="hl-sb-head-overlay" aria-hidden />

    <div className="hl-sb-head-inner">
      <div className="hl-sb-head-main">
        <div className="hl-sb-head-copy">
          <p className="hl-sb-head-kicker">Hyperliquid · HIP-4</p>
          <h1 className="hl-sb-head-title">Betting</h1>
          <p className="hl-sb-head-sub">World Cup, crypto &amp; macro markets</p>
        </div>
      </div>

      <div className="hl-sb-head-toolbar">
        <BettingCategoryNav
          tabs={BETTING_CATEGORY_TABS}
          active={category}
          counts={categoryCounts}
          onChange={onCategoryChange}
          variant="banner"
        />
        <div className="hl-sb-search-wrap hl-sb-search-wrap--head">
          <Search size={14} className="hl-sb-search-icon" aria-hidden />
          <input
            type="search"
            className="hl-sb-search"
            placeholder="Search markets…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search betting markets"
          />
          {searchQuery ? (
            <button
              type="button"
              className="hl-sb-search-clear"
              aria-label="Clear search"
              onClick={() => onSearchChange('')}
            >
              <X size={12} aria-hidden />
            </button>
          ) : null}
        </div>
        {onRefresh ? (
          <button
            type="button"
            className="hl-sb-head-refresh-pill"
            onClick={onRefresh}
            disabled={refreshDisabled}
            aria-label={syncing ? 'Syncing markets' : 'Refresh markets'}
          >
            <RefreshCw size={13} className={syncing ? 'hl-spin' : undefined} aria-hidden />
            <span>{syncing ? 'Syncing' : 'Refresh'}</span>
          </button>
        ) : null}
      </div>
    </div>
  </header>
);

export default SportsbetsHero;
