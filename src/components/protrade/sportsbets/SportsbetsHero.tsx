import React from 'react';
import { Search } from 'lucide-react';
import { BETTING_CATEGORY_TABS } from '../../../lib/hyperliquid/outcomes/categories';
import type { BettingCategoryId } from '../../../lib/hyperliquid/outcomes/categories';
import { fmtClosedPnl, fmtUsdSymbol } from '../../../lib/hyperliquid/format';
import BettingCategoryNav from './BettingCategoryNav';

export type SportsbetsWalletSummary = {
  balanceUsd: number;
  positionsValueUsd: number;
  unrealizedPnlUsd: number;
  positionCount: number;
};

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
  walletSummary?: SportsbetsWalletSummary | null;
  signedIn?: boolean;
  walletConnected?: boolean;
  onOpenPositions?: () => void;
  onCashOutFirst?: () => void;
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
  walletSummary,
  signedIn,
  walletConnected,
  onOpenPositions,
  onCashOutFirst,
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

      {signedIn && walletConnected && walletSummary ? (
        <div className="hl-sb-wallet-bar" aria-label="Betting wallet">
          <div className="hl-sb-wallet-stat">
            <span className="hl-sb-wallet-label">HL balance</span>
            <strong>{fmtUsdSymbol(walletSummary.balanceUsd)}</strong>
          </div>
          {walletSummary.positionCount > 0 ? (
            <>
              <div className="hl-sb-wallet-stat">
                <span className="hl-sb-wallet-label">Open bets</span>
                <strong>{fmtUsdSymbol(walletSummary.positionsValueUsd)}</strong>
              </div>
              <div className="hl-sb-wallet-stat">
                <span className="hl-sb-wallet-label">uPnL</span>
                <strong className={walletSummary.unrealizedPnlUsd >= 0 ? 'hl-pos' : 'hl-neg'}>
                  {fmtClosedPnl(walletSummary.unrealizedPnlUsd)}
                </strong>
              </div>
              <div className="hl-sb-wallet-actions">
                {onOpenPositions ? (
                  <button type="button" className="hl-sb-wallet-btn" onClick={onOpenPositions}>
                    My bets ({walletSummary.positionCount})
                  </button>
                ) : null}
                {onCashOutFirst ? (
                  <button type="button" className="hl-sb-wallet-btn hl-sb-wallet-btn--accent" onClick={onCashOutFirst}>
                    Cash out
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="hl-sb-wallet-hint">USDC on Hyperliquid · min $10 per bet</p>
          )}
        </div>
      ) : null}

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
