import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import { BETTING_CATEGORY_TABS } from '../../../lib/hyperliquid/outcomes/categories';
import type { BettingCategoryId } from '../../../lib/hyperliquid/outcomes/categories';
import { BETTING_MOBILE_MQ, useMediaQuery } from '../../../hooks/useMediaQuery';
import BettingCategoryNav from './BettingCategoryNav';

const BETTING_BANNER_ART = '/images/betting/13-pomylok-u-stavkah-na-sport-yakyh-slid-unykaty-removebg-preview.png';

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
}) => {
  const isMobile = useMediaQuery(BETTING_MOBILE_MQ);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isMobile) setSearchOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (searchQuery.trim()) setSearchOpen(true);
  }, [searchQuery]);

  const closeSearch = () => {
    setSearchOpen(false);
    onSearchChange('');
  };

  const showExpandedSearch = !isMobile || searchOpen;

  return (
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
          <div className="hl-sb-head-art" aria-hidden>
            <img
              src={BETTING_BANNER_ART}
              alt=""
              width={220}
              height={160}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>

        <div className={`hl-sb-head-toolbar${isMobile ? ' hl-sb-head-toolbar--mobile' : ''}`}>
          <div className="hl-sb-head-toolbar-cats">
            <BettingCategoryNav
              tabs={BETTING_CATEGORY_TABS}
              active={category}
              counts={categoryCounts}
              onChange={onCategoryChange}
              variant="banner"
            />
          </div>

          <div className="hl-sb-head-toolbar-actions">
            {isMobile && !searchOpen ? (
              <button
                type="button"
                className="hl-sb-search-toggle"
                aria-label="Search markets"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={15} aria-hidden />
              </button>
            ) : null}

            {showExpandedSearch ? (
              <div
                className={`hl-sb-search-wrap hl-sb-search-wrap--head${
                  isMobile ? ' hl-sb-search-wrap--mobile-expanded' : ''
                }`}
              >
                <Search size={14} className="hl-sb-search-icon" aria-hidden />
                <input
                  ref={searchInputRef}
                  type="search"
                  className="hl-sb-search"
                  placeholder="Search markets…"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  aria-label="Search betting markets"
                />
                {searchQuery || isMobile ? (
                  <button
                    type="button"
                    className="hl-sb-search-clear"
                    aria-label="Clear search"
                    onClick={() => (isMobile && !searchQuery ? closeSearch() : onSearchChange(''))}
                  >
                    <X size={12} aria-hidden />
                  </button>
                ) : null}
              </div>
            ) : null}

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
      </div>
    </header>
  );
};

export default SportsbetsHero;
