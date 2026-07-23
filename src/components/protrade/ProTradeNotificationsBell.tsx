import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTradeNotifications } from '../../contexts/TradeNotificationsContext';
import type { ActivityNotification } from '../../lib/activityNotifications';
import { fmtClosedPnl } from '../../lib/hyperliquid/format';

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
  const { t } = useTranslation();
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
        aria-label={
          unreadCount
            ? t('notifications.unreadAria', { count: unreadCount })
            : t('notifications.aria')
        }
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={15} />
        {unreadCount > 0 ? (
          <span className="hl-notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="hl-notif-panel" role="dialog" aria-label={t('notifications.dialogAria')}>
          <div className="hl-notif-panel-head">
            <span className="hl-notif-panel-title">{t('notifications.title')}</span>
            {unreadCount > 0 ? (
              <button type="button" className="hl-notif-mark-read" onClick={markAllRead}>
                {t('notifications.markRead')}
              </button>
            ) : null}
          </div>

          {isLoading ? (
            <p className="hl-notif-empty">{t('notifications.loading')}</p>
          ) : preview.length === 0 ? (
            <p className="hl-notif-empty">{t('notifications.empty')}</p>
          ) : (
            <ul className="hl-notif-list">
              {preview.map((n) => {
                const { date, time } = fmtWhen(n.closedAt);
                const unread = isUnread(n);
                const isBetting = n.kind === 'betting';
                const isCommunity = n.kind === 'community';
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`hl-notif-item ${unread ? 'hl-notif-item--unread' : ''}`}
                      onClick={() => {
                        markReadThrough(n.closedAt);
                        setOpen(false);
                        onViewHistory(n);
                      }}
                    >
                      <span className="hl-notif-item-top">
                        <span>
                          {isCommunity ? (
                            <>
                              <span className="hl-notif-kind">{t('notifications.kindCommunity')}</span>{' '}
                              {n.headline}
                            </>
                          ) : isBetting ? (
                            <>
                              <span className="hl-notif-kind">{t('notifications.kindBet')}</span>{' '}
                              {n.headline}
                              {n.detail ? ` · ${n.detail}` : ''}
                            </>
                          ) : (
                            n.headline
                          )}
                        </span>
                        {!isCommunity ? (
                          <span className={n.profitLoss >= 0 ? 'hl-up' : 'hl-down'}>
                            {fmtClosedPnl(n.profitLoss)}
                            {n.profitLossPercent != null && Number.isFinite(n.profitLossPercent) ? (
                              <span className="hl-notif-roi">
                                {' '}
                                · {n.profitLossPercent >= 0 ? '+' : ''}
                                {n.profitLossPercent.toFixed(2)}%
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      <span className="hl-notif-item-meta">
                        {date} {time}
                        {isCommunity && n.detail ? (
                          <span className="hl-notif-kind" style={{ marginLeft: 6 }}>
                            {n.detail.slice(0, 48)}
                            {n.detail.length > 48 ? '…' : ''}
                          </span>
                        ) : null}
                        {!isBetting && !isCommunity && n.highlightId ? (
                          <span className="hl-notif-kind">{t('notifications.kindBot')}</span>
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
            {t('notifications.viewHistory')}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ProTradeNotificationsBell;
