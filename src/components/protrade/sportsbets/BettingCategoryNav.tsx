import React from 'react';
import { useTranslation } from 'react-i18next';
import type { BettingCategoryId, BettingCategoryTab } from '../../../lib/hyperliquid/outcomes/categories';

type Props = {
  tabs: BettingCategoryTab[];
  active: BettingCategoryId;
  counts: Record<BettingCategoryId, number>;
  onChange: (id: BettingCategoryId) => void;
  variant?: 'default' | 'banner';
};

const BettingCategoryNav: React.FC<Props> = ({ tabs, active, counts, onChange, variant = 'default' }) => {
  const { t } = useTranslation();

  return (
    <nav
      className={`hl-bet-cats ${variant === 'banner' ? 'hl-bet-cats--banner' : ''}`}
      aria-label={t('betting.categoriesAria')}
    >
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
            {tab.emoji ? (
              <span className="hl-bet-cat-emoji" aria-hidden>
                {tab.emoji}
              </span>
            ) : null}
            <span className="hl-bet-cat-label">{t(tab.labelKey)}</span>
            <span className="hl-bet-cat-count">{count}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default BettingCategoryNav;
