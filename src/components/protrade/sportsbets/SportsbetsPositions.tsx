import React from 'react';
import { useTranslation } from 'react-i18next';
import { fmtClosedPnl, fmtUsdSymbol, fmtTimeMs } from '../../../lib/hyperliquid/format';
import { parseOutcomeOrderCoin } from '../../../lib/hyperliquid/outcomes/encoding';
import type { HlOpenOrder, HlUserFill } from '../../../lib/hyperliquid/user';
import type { HlOutcomePosition } from '../../../lib/hyperliquid/outcomes/types';

type Props = {
  positions: HlOutcomePosition[];
  openOrders: HlOpenOrder[];
  fills: HlUserFill[];
  loading?: boolean;
  onCancelOrder?: (outcomeId: number, side: 0 | 1, oid: number) => void;
  cancelBusy?: boolean;
};

const SportsbetsPositions: React.FC<Props> = ({
  positions,
  openOrders,
  fills,
  loading,
  onCancelOrder,
  cancelBusy,
}) => {
  const { t } = useTranslation();
  const recentFills = fills.slice(0, 12);

  return (
    <section className="hl-sb-dock">
      <div className="hl-sb-dock-grid">
        <div className="hl-sb-dock-panel">
          <h3 className="hl-sb-dock-title">{t('betting.yourBets')}</h3>
          {loading && positions.length === 0 ? (
            <p className="hl-sb-muted">{t('betting.loadingShort')}</p>
          ) : positions.length === 0 ? (
            <p className="hl-sb-muted">{t('betting.noOpenBets')}</p>
          ) : (
            <table className="hl-sb-table">
              <thead>
                <tr>
                  <th>{t('betting.market')}</th>
                  <th>{t('betting.side')}</th>
                  <th>{t('betting.size')}</th>
                  <th>{t('betting.avg')}</th>
                  <th>{t('betting.mark')}</th>
                  <th>{t('betting.value')}</th>
                  <th>{t('betting.pnl')}</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.balanceCoin}>
                    <td>{p.marketName}</td>
                    <td>{p.sideLabel}</td>
                    <td>{Math.floor(p.size)}</td>
                    <td>{p.avgEntryPx.toFixed(4)}</td>
                    <td>{p.markPx.toFixed(4)}</td>
                    <td>{fmtUsdSymbol(p.valueUsd)}</td>
                    <td className={p.unrealizedPnl >= 0 ? 'hl-pos' : 'hl-neg'}>
                      {fmtClosedPnl(p.unrealizedPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="hl-sb-dock-panel">
          <h3 className="hl-sb-dock-title">{t('betting.openBets')}</h3>
          {openOrders.length === 0 ? (
            <p className="hl-sb-muted">{t('betting.noPendingBets')}</p>
          ) : (
            <table className="hl-sb-table">
              <thead>
                <tr>
                  <th>{t('betting.coin')}</th>
                  <th>{t('betting.side')}</th>
                  <th>Price</th>
                  <th>{t('betting.size')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {openOrders.map((o) => {
                  const parsed = parseOutcomeOrderCoin(o.coin);
                  return (
                    <tr key={o.oid}>
                      <td>{o.coin}</td>
                      <td>{o.side}</td>
                      <td>{Number(o.limitPx).toFixed(4)}</td>
                      <td>{Number(o.sz).toFixed(0)}</td>
                      <td>
                        {parsed && onCancelOrder ? (
                          <button
                            type="button"
                            className="hl-sb-link-btn"
                            disabled={cancelBusy}
                            onClick={() => onCancelOrder(parsed.outcomeId, parsed.side, o.oid)}
                          >
                            {t('betting.cancel')}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="hl-sb-dock-panel hl-sb-dock-panel--wide">
          <h3 className="hl-sb-dock-title">{t('betting.recentResults')}</h3>
          {recentFills.length === 0 ? (
            <p className="hl-sb-muted">No settled activity yet.</p>
          ) : (
            <table className="hl-sb-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>{t('betting.market')}</th>
                  <th>{t('betting.side')}</th>
                  <th>Price</th>
                  <th>{t('betting.size')}</th>
                  <th>Fee</th>
                </tr>
              </thead>
              <tbody>
                {recentFills.map((f) => (
                  <tr key={`${f.tid ?? f.time}-${f.coin}`}>
                    <td>{fmtTimeMs(f.time)}</td>
                    <td>{f.coin}</td>
                    <td>{f.side}</td>
                    <td>{Number(f.px).toFixed(4)}</td>
                    <td>{Number(f.sz).toFixed(0)}</td>
                    <td>{fmtUsdSymbol(f.fee, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
};

export default SportsbetsPositions;
