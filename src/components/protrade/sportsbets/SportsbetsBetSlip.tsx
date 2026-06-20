import React, { useState } from 'react';
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
  onCancelOrder?: (outcomeId: number, side: 0 | 1, oid: number) => void;
  cancelBusy?: boolean;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'positions', label: 'My bets' },
  { id: 'orders', label: 'Pending' },
  { id: 'history', label: 'History' },
];

const SportsbetsBetSlip: React.FC<Props> = ({
  positions,
  openOrders,
  fills,
  loading,
  onCancelOrder,
  cancelBusy,
}) => {
  const [tab, setTab] = useState<TabId>('positions');
  const recentFills = fills.slice(0, 8);

  const counts: Record<TabId, number> = {
    positions: positions.length,
    orders: openOrders.length,
    history: recentFills.length,
  };

  return (
    <aside className="hl-sb-slip" aria-label="Bet slip">
      <div className="hl-sb-slip-head">
        <h3 className="hl-sb-slip-title">Bet slip</h3>
        <div className="hl-sb-slip-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`hl-sb-slip-tab ${tab === t.id ? 'hl-sb-slip-tab--on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {counts[t.id] > 0 ? (
                <span className="hl-sb-slip-count">{counts[t.id]}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="hl-sb-slip-body">
        {tab === 'positions' ? (
          loading && positions.length === 0 ? (
            <p className="hl-sb-slip-empty">Loading your bets…</p>
          ) : positions.length === 0 ? (
            <p className="hl-sb-slip-empty">No open positions. Pick Yes or No on a market to bet.</p>
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
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === 'orders' ? (
          openOrders.length === 0 ? (
            <p className="hl-sb-slip-empty">No pending limit orders.</p>
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
                          Cancel
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
          recentFills.length === 0 ? (
            <p className="hl-sb-slip-empty">No recent fills yet.</p>
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
