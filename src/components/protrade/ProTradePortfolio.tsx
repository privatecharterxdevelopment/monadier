import React, { useMemo } from 'react';
import { Loader2, Gift, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { HlAccountState, HlSpotBalance } from '../../lib/hyperliquid/user';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { readNum, toNum } from '../../lib/hyperliquid/parse';
import ProTradeBettingTables from './ProTradeBettingTables';
import { useBettingPortfolio } from '../../hooks/useBettingPortfolio';
import { useHlAccountSnapshot } from '../../hooks/useHlAccountSnapshot';
import ProTradePageShell from './ProTradePageShell';
import HlFundsOverviewPanel from './HlFundsOverviewPanel';

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
  onRequireSignIn?: (reason: string) => void;
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
  onRequireSignIn,
}) => {
  const { t } = useTranslation();
  const betting = useBettingPortfolio({
    walletAddress,
    enabled: connected,
  });
  const { snapshot: hlSnapshot } = useHlAccountSnapshot(walletAddress?.toLowerCase());
  const rawPerpValue = readNum(account, ['margin', 'accountValue']);
  const rawWithdrawable = toNum(account?.withdrawable);
  const perpValue = hlSnapshot?.accountUsd ?? rawPerpValue;
  const tradablePerpUsd = hlSnapshot?.tradablePerpUsd ?? rawPerpValue;
  const withdrawable = hlSnapshot?.withdrawableUsd ?? rawWithdrawable;
  const marginInUse = hlSnapshot?.totalMarginUsedUsd ?? 0;
  const unifiedAccount = hlSnapshot?.unifiedAccount ?? false;
  const spotUsdc = useMemo(
    () => spotBalances.find((b) => b.coin === 'USDC'),
    [spotBalances]
  );
  const spotTotal = useMemo(
    () => spotBalances.reduce((s, b) => s + spotUsdValue(b, spotPrices), 0),
    [spotBalances, spotPrices]
  );
  const totalValue = hlSnapshot?.totalUsd ?? perpValue + spotTotal;
  const perpSubline = useMemo(() => {
    if (marginInUse > 0.005) {
      return t('app.portfolio.withdrawableMargin', {
        withdrawable: fmtUsdSymbol(withdrawable),
        margin: fmtUsdSymbol(marginInUse),
      });
    }
    return t('app.portfolio.withdrawable', { amount: fmtUsdSymbol(withdrawable) });
  }, [marginInUse, t, withdrawable]);
  const perpMainValue =
    unifiedAccount && tradablePerpUsd > perpValue + 0.005 ? tradablePerpUsd : perpValue;

  if (!connected) {
    return (
      <ProTradePageShell className="hl-portfolio-page">
        <p className="hl-portfolio-empty">{t('app.portfolio.connectWallet')}</p>
      </ProTradePageShell>
    );
  }

  if (loading && !account) {
    return (
      <ProTradePageShell className="hl-portfolio-page">
        <div className="hl-portfolio-state hl-portfolio-state--inset">
          <Loader2 size={22} className="animate-spin" aria-hidden />
          <span>{t('app.portfolio.loading')}</span>
        </div>
      </ProTradePageShell>
    );
  }

  return (
    <ProTradePageShell className="hl-portfolio-page">
      <header className="hl-portfolio-hero">
        <div className="hl-portfolio-hero__icon" aria-hidden>
          <Wallet size={20} />
        </div>
        <div>
          <h1 className="hl-portfolio-hero__title">{t('app.portfolio.title')}</h1>
          <p className="hl-portfolio-hero__lead">
            {t('app.portfolio.lead')}
          </p>
        </div>
      </header>

      <div className="hl-portfolio-summary">
        <article className="hl-portfolio-card">
          <span className="hl-portfolio-card-label">{t('app.portfolio.perpAccount')}</span>
          <span className="hl-portfolio-card-value">{fmtUsdSymbol(perpMainValue)}</span>
          <span className="hl-portfolio-card-sub">{perpSubline}</span>
        </article>
        <article className="hl-portfolio-card">
          <span className="hl-portfolio-card-label">{t('app.portfolio.spotAccount')}</span>
          <span className="hl-portfolio-card-value">{fmtUsdSymbol(spotTotal)}</span>
          <span className="hl-portfolio-card-sub">USDC {fmtUsdSymbol(toNum(spotUsdc?.total))}</span>
        </article>
        <article className="hl-portfolio-card hl-portfolio-card--total">
          <span className="hl-portfolio-card-label">{t('app.portfolio.totalEst')}</span>
          <span className="hl-portfolio-card-value">{fmtUsdSymbol(totalValue)}</span>
          <span className="hl-portfolio-card-sub">{t('app.portfolio.perpsPlusSpot')}</span>
        </article>
      </div>

      <HlFundsOverviewPanel
        walletAddress={walletAddress}
        onRequireSignIn={onRequireSignIn}
        title="Hyperliquid account"
      />

      {onNavigateAffiliate ? (
        <button type="button" className="hl-portfolio-affiliate-btn" onClick={onNavigateAffiliate}>
          <span className="hl-portfolio-affiliate-btn__icon" aria-hidden>
            <Gift size={18} />
          </span>
          <span className="hl-portfolio-affiliate-btn__copy">
            <strong>{t('app.portfolio.affiliateProgram')}</strong>
            <span>{t('app.portfolio.affiliateDesc')}</span>
          </span>
        </button>
      ) : null}

      <section className="hl-portfolio-panel">
        <div className="hl-portfolio-panel__head">
          <h2 className="hl-portfolio-panel__title">{t('app.portfolio.perpPositions')}</h2>
          <span className="hl-portfolio-panel__meta">{t('app.portfolio.openCount', { count: (account?.positions ?? []).length })}</span>
        </div>
        <div className="hl-portfolio-panel__body">
          {(account?.positions ?? []).length === 0 ? (
            <p className="hl-portfolio-empty">{t('app.portfolio.noPerpPositions')}</p>
          ) : (
            <div className="hl-portfolio-table-wrap">
              <table className="hl-dock-table hl-portfolio-table">
                <thead>
                  <tr>
                    <th>{t('app.portfolio.coin')}</th>
                    <th>{t('app.portfolio.size')}</th>
                    <th>{t('app.portfolio.entry')}</th>
                    <th>{t('app.portfolio.upnl')}</th>
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
          <h2 className="hl-portfolio-panel__title">{t('app.portfolio.spotBalances')}</h2>
          <span className="hl-portfolio-panel__meta">{t('app.portfolio.tokensCount', { count: spotBalances.length })}</span>
        </div>
        <div className="hl-portfolio-panel__body">
          {spotBalances.length === 0 ? (
            <p className="hl-portfolio-empty">{t('app.portfolio.noSpotBalances')}</p>
          ) : (
            <div className="hl-portfolio-table-wrap">
              <table className="hl-dock-table hl-portfolio-table">
                <thead>
                  <tr>
                    <th>{t('app.portfolio.token')}</th>
                    <th>{t('app.portfolio.total')}</th>
                    <th>{t('app.portfolio.onHold')}</th>
                    <th>{t('app.portfolio.mark')}</th>
                    <th>{t('app.portfolio.valueEst')}</th>
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
          <h2 className="hl-portfolio-panel__title">{t('app.portfolio.betting')}</h2>
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
    </ProTradePageShell>
  );
};

export default ProTradePortfolio;
