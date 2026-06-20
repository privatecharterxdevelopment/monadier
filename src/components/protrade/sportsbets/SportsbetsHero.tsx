import React from 'react';
import { Search } from 'lucide-react';
import { BETTING_CATEGORY_TABS } from '../../../lib/hyperliquid/outcomes/categories';
import type { BettingCategoryId } from '../../../lib/hyperliquid/outcomes/categories';
import BettingCategoryNav from './BettingCategoryNav';

type Props = {
  marketCount: number;
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
  marketCount,
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
        <div className="hl-sb-head-meta">
          <span className="hl-sb-head-stat">
            <span className={`hl-sb-live-dot ${syncing ? 'hl-sb-live-dot--sync' : ''}`} />
            {marketCount} markets · {syncing ? 'Syncing' : 'Live'}
          </span>
          {onRefresh ? (
            <button
              type="button"
              className="hl-sb-head-refresh"
              onClick={onRefresh}
              disabled={refreshDisabled}
            >
              Refresh
            </button>
          ) : null}
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
          <Search size={14} aria-hidden />
          <input
            type="search"
            className="hl-sb-search"
            placeholder="Search events, teams, macro…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search betting markets"
          />
        </div>
      </div>
    </div>
  </header>
);

export default SportsbetsHero;
