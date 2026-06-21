import React, { useState } from 'react';
import { CheckCircle, Clock, Headphones, Loader2, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { submitSupportMessage } from '../../lib/supportMessage';

type Props = {
  onRequireSignIn?: (reason: string) => void;
};

const ProTradeSupport: React.FC<Props> = ({ onRequireSignIn }) => {
  const { user, profile } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sending, setSending] = useState(false);

  const displayEmail = profile?.email || user?.email || '—';
  const displayName = profile?.full_name || profile?.username || '—';
  const userId = user?.id ?? '—';
  const shortId = userId !== '—' ? `${userId.slice(0, 8)}…` : '—';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);

    const result = await submitSupportMessage({ subject, message });
    setSending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess(true);
    setSubject('');
    setMessage('');
  };

  if (!user) {
    return (
      <div className="hl-support-page">
        <div className="hl-support-gate">
          <div className="hl-support-gate-icon" aria-hidden>
            <Headphones size={28} />
          </div>
          <h1 className="hl-support-title">Support</h1>
          <p className="hl-support-lead">
            Sign in to your Monadier account to contact our team. Support is available for registered
            users only.
          </p>
          <button
            type="button"
            className="hl-support-primary"
            onClick={() => onRequireSignIn?.('Sign in to contact support.')}
          >
            Sign in to get help
          </button>
          <p className="hl-support-note">
            Never share your seed phrase or private keys — not even with support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="hl-support-page">
      <div className="hl-support-card">
        <form className="hl-support-form" onSubmit={handleSubmit}>
          <div className="hl-support-form-head">
            <div className="hl-support-head-icon" aria-hidden>
              <Headphones size={22} />
            </div>
            <div>
              <h1 className="hl-support-title">Support</h1>
              <p className="hl-support-lead">
                Describe your issue — we reply to your account email within 24 hours.
              </p>
            </div>
          </div>

          <div className="hl-support-user">
            <p className="hl-support-user-label">Sending as</p>
            <p className="hl-support-user-value">
              {displayName} · {displayEmail}
            </p>
            <p className="hl-support-user-meta">
              User ID: <code>{shortId}</code>
              {profile?.username ? <> · @{profile.username}</> : null}
            </p>
          </div>

          <label className="hl-support-label" htmlFor="hl-support-subject">
            Subject
          </label>
          <input
            id="hl-support-subject"
            type="text"
            className="hl-support-input"
            placeholder="e.g. Bot not trading, deposit, withdrawal"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
            disabled={sending || success}
            required
          />

          <label className="hl-support-label" htmlFor="hl-support-message">
            Message
          </label>
          <textarea
            id="hl-support-message"
            className="hl-support-textarea"
            placeholder="Describe your issue — include wallet/network details if relevant."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={5000}
            rows={9}
            disabled={sending || success}
            required
          />

          {error ? (
            <p className="hl-support-error" role="alert">
              {error}
            </p>
          ) : null}

          {success ? (
            <p className="hl-support-success" role="status">
              Message sent. We&apos;ll reply to {displayEmail}.
            </p>
          ) : null}

          <button
            type="submit"
            className="hl-support-primary"
            disabled={sending || success || !subject.trim() || !message.trim()}
          >
            {sending ? (
              <>
                <Loader2 size={16} className="hl-spin" aria-hidden />
                Sending…
              </>
            ) : success ? (
              <>
                <CheckCircle size={16} aria-hidden />
                Sent
              </>
            ) : (
              <>
                <Send size={16} aria-hidden />
                Send message
              </>
            )}
          </button>
        </form>

        <div className="hl-support-hours">
          <Clock size={16} aria-hidden />
          <div>
            <strong>Support hours</strong>
            <p>Monday – Sunday, 9:00 – 20:00 CET · replies within 24h</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProTradeSupport;
