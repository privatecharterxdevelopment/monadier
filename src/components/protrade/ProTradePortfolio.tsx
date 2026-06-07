import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { HlAccountState, HlSpotBalance } from '../../lib/hyperliquid/user';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { readNum, toNum } from '../../lib/hyperliquid/parse';

type Props = {
  account: HlAccountState | null;
  spotBalances: HlSpotBalance[];
  loading: boolean;
  connected: boolean;
};

function spotUsdValue(b: HlSpotBalance): number {
  if (b.coin === 'USDC' || b.coin === 'USDE' || b.coin === 'USDH') return toNum(b.total);
  return toNum(b.entryNtl);
}

const ProTradePortfolio: React.FC<Props> = ({ account, spotBalances, loading, connected }) => {
  const perpValue = readNum(account, ['margin', 'accountValue']);
  const withdrawable = toNum(account?.withdrawable);
  const spotUsdc = useMemo(
    () => spotBalances.find((b) => b.coin === 'USDC'),
    [spotBalances]
  );
  const spotTotal = useMemo(
    () => spotBalances.reduce((s, b) => s + spotUsdValue(b), 0),
    [spotBalances]
  );
  const otherSpot = useMemo(
    () => spotBalances.filter((b) => b.coin !== 'USDC'),
    [spotBalances]
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
                  <td>{p.coin}</td>
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
                <th>Value (est.)</th>
              </tr>
            </thead>
            <tbody>
              {spotBalances.map((b) => (
                <tr key={`${b.coin}-${b.token}`}>
                  <td>{b.coin}</td>
                  <td>{b.total}</td>
                  <td>{b.hold}</td>
                  <td>{fmtUsdSymbol(spotUsdValue(b))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {otherSpot.length > 0 ? (
          <p className="hl-portfolio-hint">
            Non-USDC spot values use entry notional estimates.
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default ProTradePortfolio;
