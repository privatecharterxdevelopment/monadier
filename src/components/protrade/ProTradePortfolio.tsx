import React, { useMemo } from 'react';
import { Loader2, Gift } from 'lucide-react';
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
      <div className="hl-portfolio">
        <p className="hl-portfolio-empty">Connect wallet to view portfolio.</p>
      </div>
    );
  }

  if (loading && !account) {
    return (
      <div className="hl-portfolio">
        <Loader2 size={20} className="animate-spin" style={{ margin: '40px auto' }} />
      </div>
    );
  }

  return (
    <div className="hl-portfolio">
      <div className="hl-portfolio-summary">
        <div className="hl-portfolio-card">
          <span className="hl-portfolio-card-label">Perp account</span>
          <span className="hl-portfolio-card-value">{fmtUsdSymbol(perpValue)}</span>
          <span className="hl-portfolio-card-sub">Withdrawable {fmtUsdSymbol(withdrawable)}</span>
        </div>
        <div className="hl-portfolio-card">
          <span className="hl-portfolio-card-label">Spot account</span>
          <span className="hl-portfolio-card-value">{fmtUsdSymbol(spotTotal)}</span>
          <span className="hl-portfolio-card-sub">
            USDC {fmtUsdSymbol(toNum(spotUsdc?.total))}
          </span>
        </div>
        <div className="hl-portfolio-card hl-portfolio-card--accent">
          <span className="hl-portfolio-card-label">Total (est.)</span>
          <span className="hl-portfolio-card-value">{fmtUsdSymbol(perpValue + spotTotal)}</span>
        </div>
      </div>

      {onNavigateAffiliate ? (
        <div className="hl-portfolio-section hl-portfolio-affiliate-cta">
          <button type="button" className="hl-portfolio-affiliate-btn" onClick={onNavigateAffiliate}>
            <Gift size={18} aria-hidden />
            <div>
              <strong>Affiliate program</strong>
              <span>Earn 2% from your referrals&apos; profitable bot trades.</span>
            </div>
          </button>
        </div>
      ) : null}

      <div className="hl-portfolio-section">
        <h3 className="hl-portfolio-heading">Perp positions</h3>
        {(account?.positions ?? []).length === 0 ? (
          <p className="hl-portfolio-empty">No open perp positions.</p>
        ) : (
          <table className="hl-dock-table">
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
                      <button type="button" className="hl-coin-link" onClick={() => onNavigatePerps(p.coin)}>
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
        )}
      </div>

      <div className="hl-portfolio-section">
        <h3 className="hl-portfolio-heading">Spot balances</h3>
        {spotBalances.length === 0 ? (
          <p className="hl-portfolio-empty">No spot balances.</p>
        ) : (
          <table className="hl-dock-table">
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
                        <button type="button" className="hl-coin-link" onClick={() => onNavigateSpot(b.coin)}>
                          {b.coin}
                        </button>
                      ) : (
                        b.coin
                      )}
                    </td>
                    <td>{b.total}</td>
                    <td>{b.hold}</td>
                    <td>{mark != null && mark > 0 ? fmtUsdSymbol(mark, mark < 1 ? 4 : 2) : '—'}</td>
                    <td>{fmtUsdSymbol(spotUsdValue(b, spotPrices))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="hl-portfolio-section">
        <h3 className="hl-portfolio-heading">Betting</h3>
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
    </div>
  );
};

export default ProTradePortfolio;
