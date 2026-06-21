import React, { useState } from 'react';
import { CheckCircle, Clock, Loader2, MessageCircle, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { MONADIER_SUPPORT_INBOX } from '../../lib/supportConfig';
import { submitSupportMessage } from '../../lib/supportMessage';
import TerminalModalFrame from './TerminalModalFrame';

type Props = {
  onClose: () => void;
};

const TerminalSupportModal: React.FC<Props> = ({ onClose }) => {
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

  const footer = (
    <button
      type="submit"
      form="term-support-form"
      className="term-modal-primary"
      disabled={sending || success || !subject.trim() || !message.trim()}
    >
      {sending ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Sending…
        </>
      ) : success ? (
        <>
          <CheckCircle size={16} />
          Sent
        </>
      ) : (
        <>
          <Send size={16} />
          Send message
        </>
      )}
    </button>
  );

  return (
    <TerminalModalFrame
      title="Support"
      subtitle="Send a message — we reply to your account email within 24 hours."
      onClose={onClose}
      closeDisabled={sending}
      icon={<MessageCircle size={18} />}
      footer={footer}
    >
      <div className="term-support-modal">
        <div className="term-support-user">
          <p className="term-support-user-label">Sending as</p>
          <p className="term-support-user-value">
            {displayName} · {displayEmail}
          </p>
          <p className="term-support-user-meta">
            User ID: <code>{shortId}</code>
            {profile?.username ? (
              <>
                {' '}
                · @{profile.username}
              </>
            ) : null}
          </p>
        </div>

        <form id="term-support-form" className="term-support-form" onSubmit={handleSubmit}>
          <label className="term-modal-label" htmlFor="term-support-subject">
            Subject
          </label>
          <input
            id="term-support-subject"
            type="text"
            className="term-modal-input term-support-input"
            placeholder="e.g. Vault deposit, bot not trading, withdrawal"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
            disabled={sending || success}
            required
          />

          <label className="term-modal-label term-modal-label--flush" htmlFor="term-support-message">
            Message
          </label>
          <textarea
            id="term-support-message"
            className="term-modal-textarea"
            placeholder="Describe your issue — include wallet/network details if relevant."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={5000}
            rows={5}
            disabled={sending || success}
            required
          />

          {error && (
            <p className="term-support-error" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="term-support-success" role="status">
              Message sent. We&apos;ll reply to {displayEmail}.
            </p>
          )}
        </form>

        <div className="term-support-card term-support-card--compact">
          <Clock size={18} className="term-support-card-icon" aria-hidden />
          <div>
            <h3 className="term-support-card-title">Support hours</h3>
            <p className="term-modal-hint">
              Monday – Friday, 9:00 – 18:00 CET. Email replies within 24 hours.
            </p>
          </div>
        </div>

        <p className="term-support-note">
          Email only — no Telegram or social DMs. Never share your private key or seed phrase.
        </p>
      </div>
    </TerminalModalFrame>
  );
};

export default TerminalSupportModal;
