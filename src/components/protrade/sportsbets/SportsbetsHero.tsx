import React from 'react';
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
};

const SportsbetsHero: React.FC<Props> = ({
  marketCount,
  syncing,
  onRefresh,
  refreshDisabled,
  category,
  categoryCounts,
  onCategoryChange,
}) => (
  <header className="hl-sb-head">
    <div className="hl-sb-head-main">
      <div className="hl-sb-head-copy">
        <p className="hl-sb-head-kicker">Betting</p>
        <h1 className="hl-sb-head-title">Bet on Sports &amp; Win Big Prizes</h1>
        <p className="hl-sb-head-sub">
          Live sports, crypto &amp; macro prediction markets — World Cup, Bitcoin, Fed &amp; more with
          real-time odds.
        </p>
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
    <BettingCategoryNav
      tabs={BETTING_CATEGORY_TABS}
      active={category}
      counts={categoryCounts}
      onChange={onCategoryChange}
    />
  </header>
);

export default SportsbetsHero;
