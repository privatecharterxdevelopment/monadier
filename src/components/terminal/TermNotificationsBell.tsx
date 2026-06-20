import React, { useEffect, useRef, useState } from 'react';
import { Bell, ExternalLink } from 'lucide-react';
import { useTradeNotifications } from '../../contexts/TradeNotificationsContext';
import type { ActivityNotification } from '../../lib/activityNotifications';

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

type Props = {
  onViewHistory: (notification?: ActivityNotification) => void;
};

const TermNotificationsBell: React.FC<Props> = ({ onViewHistory }) => {
  const { notifications, unreadCount, isLoading, markAllRead, markReadThrough, isUnread } =
    useTradeNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const preview = notifications.slice(0, 8);

  return (
    <div className="term-notif-bell" ref={rootRef}>
      <button
        type="button"
        className="term-icon-btn term-notif-bell-btn"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span className="term-notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="term-notif-panel" role="dialog" aria-label="Trade notifications">
          <div className="term-notif-panel-head">
            <span className="term-notif-panel-title">Activity</span>
            {unreadCount > 0 && (
              <button type="button" className="term-notif-mark-read" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className="term-notif-panel-body">
            {isLoading && preview.length === 0 ? (
              <p className="term-notif-empty">Loading…</p>
            ) : preview.length === 0 ? (
              <p className="term-notif-empty">No activity yet</p>
            ) : (
              <ul className="term-notif-list">
                {preview.map((t) => {
                  const { date, time } = fmtWhen(t.closedAt);
                  const unread = isUnread(t);
                  const isBetting = t.kind === 'betting';
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`term-notif-item ${unread ? 'term-notif-item--unread' : ''}`}
                        onClick={() => {
                          markReadThrough(t.closedAt);
                          setOpen(false);
                          onViewHistory(t);
                        }}
                      >
                        <div className="term-notif-item-top">
                          <span className="term-notif-item-pair">
                            {isBetting ? (
                              <>
                                Bet · {t.headline}
                                {t.detail ? ` · ${t.detail}` : ''}
                              </>
                            ) : (
                              t.headline
                            )}
                          </span>
                          <span
                            className={
                              t.profitLoss >= 0
                                ? 'term-notif-item-pnl term-pnl-pos'
                                : 'term-notif-item-pnl term-pnl-neg'
                            }
                          >
                            {t.profitLoss >= 0 ? '+' : ''}
                            {fmtUsd(t.profitLoss)}
                          </span>
                        </div>
                        <div className="term-notif-item-meta">
                          <span>
                            {date} · {time}
                          </span>
                        </div>
                        {!isBetting && t.verifyUrl ? (
                          <a
                            href={t.verifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="term-notif-verify"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Verify on Arbitrum
                            <ExternalLink size={11} />
                          </a>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <button
            type="button"
            className="term-notif-panel-foot"
            onClick={() => {
              markAllRead();
              setOpen(false);
              onViewHistory();
            }}
          >
            View history
          </button>
        </div>
      )}
    </div>
  );
};

export default TermNotificationsBell;
