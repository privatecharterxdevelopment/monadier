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
  closedCount: number;
  realizedPnlUsd: number;
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
  onRequireSignIn?: () => void;
  onConnectWallet?: () => void;
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
  onRequireSignIn,
  onConnectWallet,
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

          {!signedIn ? (
            <button type="button" className="hl-sb-head-stat hl-sb-head-stat--action" onClick={onRequireSignIn}>
              Sign in · balance &amp; bets
            </button>
          ) : !walletConnected ? (
            <button type="button" className="hl-sb-head-stat hl-sb-head-stat--action" onClick={onConnectWallet}>
              Connect · balance &amp; cash out
            </button>
          ) : walletSummary ? (
            <>
              <span className="hl-sb-head-stat hl-sb-head-stat--balance" title="USDC on Hyperliquid">
                <span className="hl-sb-head-stat-label">Balance</span>
                <strong>{fmtUsdSymbol(walletSummary.balanceUsd)}</strong>
              </span>
              {walletSummary.positionCount > 0 ? (
                <button
                  type="button"
                  className="hl-sb-head-stat hl-sb-head-stat--action"
                  title="Open bets — tap to view & cash out"
                  onClick={onOpenPositions}
                >
                  <span className="hl-sb-head-stat-label">Open</span>
                  <strong>
                    {walletSummary.positionCount} · {fmtUsdSymbol(walletSummary.positionsValueUsd)}
                  </strong>
                  <span
                    className={
                      walletSummary.unrealizedPnlUsd >= 0 ? 'hl-sb-head-stat-pnl hl-pos' : 'hl-sb-head-stat-pnl hl-neg'
                    }
                  >
                    {fmtClosedPnl(walletSummary.unrealizedPnlUsd)}
                  </span>
                </button>
              ) : (
                <span className="hl-sb-head-stat hl-sb-head-stat--muted" title="No open bets">
                  <span className="hl-sb-head-stat-label">Open</span>
                  <strong>0</strong>
                </span>
              )}
              <span className="hl-sb-head-stat hl-sb-head-stat--closed" title="Realized P/L from closed bets">
                <span className="hl-sb-head-stat-label">Closed</span>
                <strong>
                  {walletSummary.closedCount > 0
                    ? `${walletSummary.closedCount} · ${fmtClosedPnl(walletSummary.realizedPnlUsd)}`
                    : '0'}
                </strong>
              </span>
              {walletSummary.positionCount > 0 && onCashOutFirst ? (
                <button type="button" className="hl-sb-head-cashout" onClick={onCashOutFirst}>
                  Cash out
                </button>
              ) : null}
            </>
          ) : null}

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
