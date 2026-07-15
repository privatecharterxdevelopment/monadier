import React, { useEffect, useRef, useState } from 'react';
import { Bell, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
    <div className="term-notif-bell" ref={rootRef}>
      <button
        type="button"
        className="term-icon-btn term-notif-bell-btn"
        aria-label={
          unreadCount
            ? t('notifications.unreadAria', { count: unreadCount })
            : t('notifications.aria')
        }
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span className="term-notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="term-notif-panel" role="dialog" aria-label={t('notifications.dialogAria')}>
          <div className="term-notif-panel-head">
            <span className="term-notif-panel-title">{t('notifications.title')}</span>
            {unreadCount > 0 && (
              <button type="button" className="term-notif-mark-read" onClick={markAllRead}>
                {t('notifications.markRead')}
              </button>
            )}
          </div>

          <div className="term-notif-panel-body">
            {isLoading && preview.length === 0 ? (
              <p className="term-notif-empty">{t('notifications.loading')}</p>
            ) : preview.length === 0 ? (
              <p className="term-notif-empty">{t('notifications.empty')}</p>
            ) : (
              <ul className="term-notif-list">
                {preview.map((n) => {
                  const { date, time } = fmtWhen(n.closedAt);
                  const unread = isUnread(n);
                  const isBetting = n.kind === 'betting';
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`term-notif-item ${unread ? 'term-notif-item--unread' : ''}`}
                        onClick={() => {
                          markReadThrough(n.closedAt);
                          setOpen(false);
                          onViewHistory(n);
                        }}
                      >
                        <div className="term-notif-item-top">
                          <span className="term-notif-item-pair">
                            {isBetting ? (
                              <>
                                {t('notifications.kindBet')} · {n.headline}
                                {n.detail ? ` · ${n.detail}` : ''}
                              </>
                            ) : (
                              n.headline
                            )}
                          </span>
                          <span
                            className={
                              n.profitLoss >= 0
                                ? 'term-notif-item-pnl term-pnl-pos'
                                : 'term-notif-item-pnl term-pnl-neg'
                            }
                          >
                            {n.profitLoss >= 0 ? '+' : ''}
                            {fmtUsd(n.profitLoss)}
                          </span>
                        </div>
                        <div className="term-notif-item-meta">
                          <span>
                            {date} · {time}
                          </span>
                        </div>
                        {!isBetting && n.verifyUrl ? (
                          <a
                            href={n.verifyUrl}
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
            {t('notifications.viewHistory')}
          </button>
        </div>
      )}
    </div>
  );
};

export default TermNotificationsBell;
