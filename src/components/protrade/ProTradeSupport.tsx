import React, { useState } from 'react';
import { CheckCircle, Clock, Headphones, Loader2, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { submitSupportMessage } from '../../lib/supportMessage';

type Props = {
  onRequireSignIn?: (reason: string) => void;
};

const ProTradeSupport: React.FC<Props> = ({ onRequireSignIn }) => {
  const { t } = useTranslation();
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
      <div className="hl-meta-canvas hl-support-page">
        <section className="hl-studio-card">
          <header className="hl-studio-card__head">
            <Headphones size={18} aria-hidden />
            <span>{t('app.support.title')}</span>
          </header>
          <div className="hl-studio-card__body hl-studio-card__body--center">
            <p className="hl-support-lead">
              {t('app.support.guestLead')}
            </p>
            <button
              type="button"
              className="hl-support-primary"
              onClick={() => onRequireSignIn?.(t('auth.signInToSupport'))}
            >
              {t('app.support.signInForHelp')}
            </button>
            <p className="hl-support-note">
              {t('app.support.securityNote')}
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="hl-meta-canvas hl-support-page">
      <section className="hl-studio-card hl-support-studio-card">
        <form className="hl-support-form" onSubmit={handleSubmit}>
          <header className="hl-studio-card__head">
            <Headphones size={18} aria-hidden />
            <span>{t('app.support.title')}</span>
          </header>

          <div className="hl-support-user">
            <p className="hl-support-user-label">{t('app.support.sendingAs')}</p>
            <p className="hl-support-user-value">
              {displayName} · {displayEmail}
            </p>
            <p className="hl-support-user-meta">
              {t('app.support.userId')} <code>{shortId}</code>
              {profile?.username ? <> · @{profile.username}</> : null}
            </p>
          </div>

          <label className="hl-support-label" htmlFor="hl-support-subject">
            {t('app.support.subject')}
          </label>
          <input
            id="hl-support-subject"
            type="text"
            className="hl-support-input"
            placeholder={t('app.support.subjectPlaceholder')}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
            disabled={sending || success}
            required
          />

          <label className="hl-support-label" htmlFor="hl-support-message">
            {t('app.support.message')}
          </label>
          <textarea
            id="hl-support-message"
            className="hl-support-textarea"
            placeholder={t('app.support.messagePlaceholder')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={5000}
            rows={5}
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
              {t('app.support.messageSent', { email: displayEmail })}
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
                {t('app.support.sending')}
              </>
            ) : success ? (
              <>
                <CheckCircle size={16} aria-hidden />
                {t('app.support.sent')}
              </>
            ) : (
              <>
                <Send size={16} aria-hidden />
                {t('app.support.sendMessage')}
              </>
            )}
          </button>
        </form>

        <div className="hl-support-hours">
          <Clock size={16} aria-hidden />
          <div>
            <strong>{t('app.support.supportHours')}</strong>
            <p>{t('app.support.supportHoursDetail')}</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ProTradeSupport;
