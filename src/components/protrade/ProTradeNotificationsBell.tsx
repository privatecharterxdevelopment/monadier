import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
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

const ProTradeNotificationsBell: React.FC<Props> = ({ onViewHistory }) => {
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
    <div className="hl-notif-bell" ref={rootRef}>
      <button
        type="button"
        className="hl-topnav-icon-btn hl-notif-bell-btn"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={15} />
        {unreadCount > 0 ? (
          <span className="hl-notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="hl-notif-panel" role="dialog" aria-label="Trade notifications">
          <div className="hl-notif-panel-head">
            <span className="hl-notif-panel-title">Activity</span>
            {unreadCount > 0 ? (
              <button type="button" className="hl-notif-mark-read" onClick={markAllRead}>
                Mark read
              </button>
            ) : null}
          </div>

          {isLoading ? (
            <p className="hl-notif-empty">Loading…</p>
          ) : preview.length === 0 ? (
            <p className="hl-notif-empty">No activity yet</p>
          ) : (
            <ul className="hl-notif-list">
              {preview.map((t) => {
                const { date, time } = fmtWhen(t.closedAt);
                const unread = isUnread(t);
                const isBetting = t.kind === 'betting';
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`hl-notif-item ${unread ? 'hl-notif-item--unread' : ''}`}
                      onClick={() => {
                        markReadThrough(t.closedAt);
                        setOpen(false);
                        onViewHistory(t);
                      }}
                    >
                      <span className="hl-notif-item-top">
                        <span>
                          {isBetting ? (
                            <>
                              <span className="hl-notif-kind">Bet</span> {t.headline}
                              {t.detail ? ` · ${t.detail}` : ''}
                            </>
                          ) : (
                            t.headline
                          )}
                        </span>
                        <span className={t.profitLoss >= 0 ? 'hl-up' : 'hl-down'}>
                          {t.profitLoss >= 0 ? '+' : ''}
                          {fmtUsd(t.profitLoss)}
                        </span>
                      </span>
                      <span className="hl-notif-item-meta">
                        {date} {time}
                        {!isBetting && t.highlightId ? (
                          <span className="hl-notif-kind">Bot</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            className="hl-notif-foot"
            onClick={() => {
              setOpen(false);
              onViewHistory();
            }}
          >
            View history
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ProTradeNotificationsBell;
