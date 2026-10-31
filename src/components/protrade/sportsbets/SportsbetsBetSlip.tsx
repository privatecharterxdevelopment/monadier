import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtClosedPnl, fmtUsdSymbol, fmtTimeMs } from '../../../lib/hyperliquid/format';
import { parseOutcomeOrderCoin } from '../../../lib/hyperliquid/outcomes/encoding';
import type { HlOpenOrder, HlUserFill } from '../../../lib/hyperliquid/user';
import type { HlOutcomePosition } from '../../../lib/hyperliquid/outcomes/types';

type TabId = 'positions' | 'orders' | 'history';

type Props = {
  positions: HlOutcomePosition[];
  openOrders: HlOpenOrder[];
  fills: HlUserFill[];
  loading?: boolean;
  signedIn?: boolean;
  walletConnected?: boolean;
  onRequireSignIn?: (reason: string) => void;
  onCancelOrder?: (outcomeId: number, side: 0 | 1, oid: number) => void;
  cancelBusy?: boolean;
  onCashOutPosition?: (position: HlOutcomePosition) => void;
};

const TAB_IDS: TabId[] = ['positions', 'orders', 'history'];

const SportsbetsBetSlip: React.FC<Props> = ({
  positions,
  openOrders,
  fills,
  loading,
  signedIn,
  walletConnected,
  onRequireSignIn,
  onCancelOrder,
  cancelBusy,
  onCashOutPosition,
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>('positions');
  const recentFills = fills.slice(0, 8);

  const counts: Record<TabId, number> = {
    positions: positions.length,
    orders: openOrders.length,
    history: recentFills.length,
  };

  const needsAuth = !signedIn || !walletConnected;

  return (
    <aside className="hl-sb-slip" aria-label={t('betting.slip.ariaLabel')}>
      <div className="hl-sb-slip-head">
        <div className="hl-sb-slip-tabs" role="tablist">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`hl-sb-slip-tab ${tab === id ? 'hl-sb-slip-tab--on' : ''}`}
              onClick={() => setTab(id)}
            >
              {t(`betting.slip.${id === 'positions' ? 'myBets' : id}`)}
              {counts[id] > 0 ? (
                <span className="hl-sb-slip-count">{counts[id]}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="hl-sb-slip-body">
        {tab === 'positions' ? (
          needsAuth ? (
            <p className="hl-sb-slip-empty">
              {signedIn ? t('betting.slip.connectToSeeBets') : t('betting.slip.signInToTrack')}
              {!signedIn && onRequireSignIn ? (
                <button
                  type="button"
                  className="hl-sb-slip-auth-btn"
                  onClick={() => onRequireSignIn(t('betting.slip.signInToTrackReason'))}
                >
                  {t('common.signIn')}
                </button>
              ) : null}
            </p>
          ) : loading && positions.length === 0 ? (
            <p className="hl-sb-slip-empty">{t('betting.slip.loadingBets')}</p>
          ) : positions.length === 0 ? (
            <p className="hl-sb-slip-empty">{t('betting.slip.noPositions')}</p>
          ) : (
            <ul className="hl-sb-slip-list">
              {positions.map((p) => (
                <li key={p.balanceCoin} className="hl-sb-slip-item">
                  <div className="hl-sb-slip-item-top">
                    <strong>{p.marketName}</strong>
                    <span className={p.unrealizedPnl >= 0 ? 'hl-pos' : 'hl-neg'}>
                      {fmtClosedPnl(p.unrealizedPnl)}
                    </span>
                  </div>
                  <div className="hl-sb-slip-item-meta">
                    <span>{p.sideLabel}</span>
                    <span>{Math.floor(p.size)} ct</span>
                    <span>{fmtUsdSymbol(p.valueUsd)}</span>
                    {onCashOutPosition ? (
                      <button
                        type="button"
                        className="hl-sb-slip-cashout-btn"
                        onClick={() => onCashOutPosition(p)}
                      >
                        {t('betting.slip.cashOutBtn')}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === 'orders' ? (
          needsAuth ? (
            <p className="hl-sb-slip-empty">{t('betting.slip.signInPending')}</p>
          ) : openOrders.length === 0 ? (
            <p className="hl-sb-slip-empty">{t('betting.slip.noPending')}</p>
          ) : (
            <ul className="hl-sb-slip-list">
              {openOrders.map((o) => {
                const parsed = parseOutcomeOrderCoin(o.coin);
                return (
                  <li key={o.oid} className="hl-sb-slip-item">
                    <div className="hl-sb-slip-item-top">
                      <strong>{o.coin}</strong>
                      <span>{o.side}</span>
                    </div>
                    <div className="hl-sb-slip-item-meta">
                      <span>@ {Number(o.limitPx).toFixed(4)}</span>
                      <span>{Number(o.sz).toFixed(0)} ct</span>
                      {parsed && onCancelOrder ? (
                        <button
                          type="button"
                          className="hl-sb-link-btn"
                          disabled={cancelBusy}
                          onClick={() => onCancelOrder(parsed.outcomeId, parsed.side, o.oid)}
                        >
                          {t('betting.slip.cancel')}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

        {tab === 'history' ? (
          needsAuth ? (
            <p className="hl-sb-slip-empty">{t('betting.slip.signInHistory')}</p>
          ) : recentFills.length === 0 ? (
            <p className="hl-sb-slip-empty">{t('betting.slip.noHistory')}</p>
          ) : (
            <ul className="hl-sb-slip-list">
              {recentFills.map((f) => (
                <li key={`${f.tid ?? f.time}-${f.coin}`} className="hl-sb-slip-item">
                  <div className="hl-sb-slip-item-top">
                    <strong>{f.coin}</strong>
                    <span>{f.side}</span>
                  </div>
                  <div className="hl-sb-slip-item-meta">
                    <span>{fmtTimeMs(f.time)}</span>
                    <span>@ {Number(f.px).toFixed(4)}</span>
                    <span>{Number(f.sz).toFixed(0)} ct</span>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </aside>
  );
};

export default SportsbetsBetSlip;
