import React from 'react';
import type { BettingCategoryId, BettingCategoryTab } from '../../../lib/hyperliquid/outcomes/categories';

type Props = {
  tabs: BettingCategoryTab[];
  active: BettingCategoryId;
  counts: Record<BettingCategoryId, number>;
  onChange: (id: BettingCategoryId) => void;
};

const BettingCategoryNav: React.FC<Props> = ({ tabs, active, counts, onChange }) => {
  return (
    <nav className="hl-bet-cats" aria-label="Betting categories">
      {tabs.map((tab) => {
        const count = counts[tab.id] ?? 0;
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            className={`hl-bet-cat ${isActive ? 'hl-bet-cat--active' : ''}`}
            aria-pressed={isActive}
            onClick={() => onChange(tab.id)}
          >
            <span className="hl-bet-cat-emoji" aria-hidden>
              {tab.emoji}
            </span>
            <span className="hl-bet-cat-label">{tab.label}</span>
            <span className="hl-bet-cat-count">{count}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default BettingCategoryNav;
