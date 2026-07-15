import React, { useEffect, useState } from 'react';
import { Globe, Loader2, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { fetchLoginActivity, type LoginEvent } from '../../lib/loginActivity';

function fmtWhen(iso: string, locale?: string) {
  return new Date(iso).toLocaleString(locale || undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseDevice(ua: string | null, t: (key: string) => string): string {
  if (!ua) return t('profile.loginHistory.unknownDevice');
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac OS/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return t('profile.loginHistory.browser');
}

const ProfileLoginHistoryPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setEventsLoading(false);
      return;
    }
    (async () => {
      setEventsLoading(true);
      const rows = await fetchLoginActivity(user.id);
      setEvents(rows);
      setEventsLoading(false);
    })();
  }, [user?.id]);

  const fallbackSignIn = user?.last_sign_in_at
    ? [
        {
          id: 'fallback',
          logged_in_at: user.last_sign_in_at,
          ip_address: null,
          user_agent: null,
          platform: 'account',
        },
      ]
    : [];

  const displayEvents = events.length > 0 ? events : fallbackSignIn;

  return (
    <div className="term-login-history-panel">
      {eventsLoading ? (
        <div className="term-security-loading">
          <Loader2 size={16} className="animate-spin" /> {t('profile.loginHistory.loading')}
        </div>
      ) : displayEvents.length === 0 ? (
        <p className="term-modal-hint">{t('profile.loginHistory.empty')}</p>
      ) : (
        <ul className="term-security-session-list">
          {displayEvents.map((ev) => (
            <li key={ev.id} className="term-security-session-item">
              <div className="term-security-session-main">
                <Monitor size={14} aria-hidden />
                <span>{parseDevice(ev.user_agent, t)}</span>
                <span className="term-security-session-time">
                  {fmtWhen(ev.logged_in_at, i18n.language)}
                </span>
              </div>
              <div className="term-security-session-meta">
                <Globe size={12} aria-hidden />
                <span>{ev.ip_address || t('profile.loginHistory.ipUnavailable')}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {events.length === 0 && user?.last_sign_in_at && (
        <p className="term-modal-hint">{t('profile.loginHistory.fallbackNote')}</p>
      )}
    </div>
  );
};

export default ProfileLoginHistoryPanel;
