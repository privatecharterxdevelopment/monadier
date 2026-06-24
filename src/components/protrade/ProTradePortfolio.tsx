import React, { useMemo } from 'react';
import { Loader2, Gift, Wallet } from 'lucide-react';
import type { HlAccountState, HlSpotBalance } from '../../lib/hyperliquid/user';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { readNum, toNum } from '../../lib/hyperliquid/parse';
import ProTradeBettingTables from './ProTradeBettingTables';
import { useBettingPortfolio } from '../../hooks/useBettingPortfolio';

type Props = {
  account: HlAccountState | null;
  spotBalances: HlSpotBalance[];
  spotPrices?: Record<string, number>;
  loading: boolean;
  connected: boolean;
  walletAddress?: string;
  onNavigatePerps?: (coin: string) => void;
  onNavigateSpot?: (coin: string) => void;
  onNavigateBetting?: () => void;
  onNavigateAffiliate?: () => void;
};

function spotUsdValue(b: HlSpotBalance, prices: Record<string, number>): number {
  const total = toNum(b.total);
  if (total <= 0) return 0;
  const px = prices[b.coin];
  if (px != null && px > 0) return total * px;
  if (b.coin === 'USDC' || b.coin === 'USDE' || b.coin === 'USDH') return total;
  return toNum(b.entryNtl);
}

const ProTradePortfolio: React.FC<Props> = ({
  account,
  spotBalances,
  spotPrices = {},
  loading,
  connected,
  walletAddress,
  onNavigatePerps,
  onNavigateSpot,
  onNavigateBetting,
  onNavigateAffiliate,
}) => {
  const betting = useBettingPortfolio({
    walletAddress,
    enabled: connected,
  });
  const perpValue = readNum(account, ['margin', 'accountValue']);
  const withdrawable = toNum(account?.withdrawable);
  const spotUsdc = useMemo(
    () => spotBalances.find((b) => b.coin === 'USDC'),
    [spotBalances]
  );
  const spotTotal = useMemo(
    () => spotBalances.reduce((s, b) => s + spotUsdValue(b, spotPrices), 0),
    [spotBalances, spotPrices]
  );

  if (!connected) {
    return (
      <div className="hl-portfolio-page">
        <div className="hl-portfolio-state">
          <p className="hl-portfolio-empty">Connect wallet to view portfolio.</p>
        </div>
      </div>
    );
  }

  if (loading && !account) {
    return (
      <div className="hl-portfolio-page">
        <div className="hl-portfolio-state">
          <Loader2 size={22} className="animate-spin" aria-hidden />
          <span>Loading portfolio…</span>
        </div>
      </div>
    );
  }

  const totalValue = perpValue + spotTotal;

  return (
    <div className="hl-portfolio-page">
      <header className="hl-portfolio-hero">
        <div className="hl-portfolio-hero__icon" aria-hidden>
          <Wallet size={20} />
        </div>
        <div>
          <h1 className="hl-portfolio-hero__title">Portfolio</h1>
          <p className="hl-portfolio-hero__lead">
            Hyperliquid perps, spot balances, and betting positions in one view.
          </p>
        </div>
      </header>

      <div className="hl-portfolio-summary">
        <article className="hl-portfolio-card">
          <span className="hl-portfolio-card-label">Perp account</span>
          <span className="hl-portfolio-card-value">{fmtUsdSymbol(perpValue)}</span>
          <span className="hl-portfolio-card-sub">Withdrawable {fmtUsdSymbol(withdrawable)}</span>
        </article>
        <article className="hl-portfolio-card">
          <span className="hl-portfolio-card-label">Spot account</span>
          <span className="hl-portfolio-card-value">{fmtUsdSymbol(spotTotal)}</span>
          <span className="hl-portfolio-card-sub">USDC {fmtUsdSymbol(toNum(spotUsdc?.total))}</span>
        </article>
        <article className="hl-portfolio-card hl-portfolio-card--total">
          <span className="hl-portfolio-card-label">Total (est.)</span>
          <span className="hl-portfolio-card-value">{fmtUsdSymbol(totalValue)}</span>
          <span className="hl-portfolio-card-sub">Perps + spot</span>
        </article>
      </div>

      {onNavigateAffiliate ? (
        <button type="button" className="hl-portfolio-affiliate-btn" onClick={onNavigateAffiliate}>
          <span className="hl-portfolio-affiliate-btn__icon" aria-hidden>
            <Gift size={18} />
          </span>
          <span className="hl-portfolio-affiliate-btn__copy">
            <strong>Affiliate program</strong>
            <span>Earn 2% from your referrals&apos; profitable bot trades.</span>
          </span>
        </button>
      ) : null}

      <section className="hl-portfolio-panel">
        <div className="hl-portfolio-panel__head">
          <h2 className="hl-portfolio-panel__title">Perp positions</h2>
          <span className="hl-portfolio-panel__meta">{(account?.positions ?? []).length} open</span>
        </div>
        <div className="hl-portfolio-panel__body">
          {(account?.positions ?? []).length === 0 ? (
            <p className="hl-portfolio-empty">No open perp positions.</p>
          ) : (
            <div className="hl-portfolio-table-wrap">
              <table className="hl-dock-table hl-portfolio-table">
                <thead>
                  <tr>
                    <th>Coin</th>
                    <th>Size</th>
                    <th>Entry</th>
                    <th>uPnL</th>
                  </tr>
                </thead>
                <tbody>
                  {(account?.positions ?? []).map((p) => (
                    <tr key={p.coin}>
                      <td>
                        {onNavigatePerps ? (
                          <button
                            type="button"
                            className="hl-coin-link"
                            onClick={() => onNavigatePerps(p.coin)}
                          >
                            {p.coin}
                          </button>
                        ) : (
                          p.coin
                        )}
                      </td>
                      <td>{p.szi}</td>
                      <td>{p.entryPx}</td>
                      <td className={toNum(p.unrealizedPnl) >= 0 ? 'hl-up' : 'hl-down'}>
                        {fmtUsdSymbol(toNum(p.unrealizedPnl))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="hl-portfolio-panel">
        <div className="hl-portfolio-panel__head">
          <h2 className="hl-portfolio-panel__title">Spot balances</h2>
          <span className="hl-portfolio-panel__meta">{spotBalances.length} tokens</span>
        </div>
        <div className="hl-portfolio-panel__body">
          {spotBalances.length === 0 ? (
            <p className="hl-portfolio-empty">No spot balances.</p>
          ) : (
            <div className="hl-portfolio-table-wrap">
              <table className="hl-dock-table hl-portfolio-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Total</th>
                    <th>On hold</th>
                    <th>Mark</th>
                    <th>Value (est.)</th>
                  </tr>
                </thead>
                <tbody>
                  {spotBalances.map((b) => {
                    const mark = spotPrices[b.coin];
                    return (
                      <tr key={`${b.coin}-${b.token}`}>
                        <td>
                          {onNavigateSpot ? (
                            <button
                              type="button"
                              className="hl-coin-link"
                              onClick={() => onNavigateSpot(b.coin)}
                            >
                              {b.coin}
                            </button>
                          ) : (
                            b.coin
                          )}
                        </td>
                        <td>{b.total}</td>
                        <td>{b.hold}</td>
                        <td>
                          {mark != null && mark > 0 ? fmtUsdSymbol(mark, mark < 1 ? 4 : 2) : '—'}
                        </td>
                        <td>{fmtUsdSymbol(spotUsdValue(b, spotPrices))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="hl-portfolio-panel hl-portfolio-panel--betting">
        <div className="hl-portfolio-panel__head">
          <h2 className="hl-portfolio-panel__title">Betting</h2>
        </div>
        <div className="hl-portfolio-panel__body hl-portfolio-panel__body--flush">
          <ProTradeBettingTables
            openBets={betting.openBets}
            closedBets={betting.closedBets}
            loading={betting.loading}
            syncing={betting.syncing}
            signedIn={betting.signedIn}
            showSummary
            summary={betting.summary}
            compact
            onNavigateBetting={onNavigateBetting}
          />
        </div>
      </section>
    </div>
  );
};

export default ProTradePortfolio;
