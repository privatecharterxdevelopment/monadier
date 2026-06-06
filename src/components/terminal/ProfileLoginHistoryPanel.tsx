import React, { useEffect, useState } from 'react';
import { Globe, Loader2, Monitor } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchLoginActivity, type LoginEvent } from '../../lib/loginActivity';

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseDevice(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac OS/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Browser';
}

const ProfileLoginHistoryPanel: React.FC = () => {
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
          <Loader2 size={16} className="animate-spin" /> Loading activity…
        </div>
      ) : displayEvents.length === 0 ? (
        <p className="term-modal-hint">No sessions logged yet.</p>
      ) : (
        <ul className="term-security-session-list">
          {displayEvents.map((ev) => (
            <li key={ev.id} className="term-security-session-item">
              <div className="term-security-session-main">
                <Monitor size={14} aria-hidden />
                <span>{parseDevice(ev.user_agent)}</span>
                <span className="term-security-session-time">{fmtWhen(ev.logged_in_at)}</span>
              </div>
              <div className="term-security-session-meta">
                <Globe size={12} aria-hidden />
                <span>{ev.ip_address || 'IP unavailable'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {events.length === 0 && user?.last_sign_in_at && (
        <p className="term-modal-hint">
          Showing your last account sign-in. Full history appears after the security database
          migration is applied.
        </p>
      )}
    </div>
  );
};

export default ProfileLoginHistoryPanel;
