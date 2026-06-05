import React, { useEffect, useMemo, useState } from 'react';
import {
  Shield,
  Mail,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Globe,
  Monitor,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import TerminalModalFrame from './TerminalModalFrame';
import { fetchLoginActivity, type LoginEvent } from '../../lib/loginActivity';
import {
  supabase,
  updatePassword,
  resetPassword,
  getAccountProviders,
} from '../../lib/supabase';

type Props = {
  onClose: () => void;
};

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

const TerminalSecurityModal: React.FC<Props> = ({ onClose }) => {
  const { user } = useAuth();
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetResendSec, setResetResendSec] = useState(0);

  const providers = useMemo(() => getAccountProviders(user), [user]);
  const hasEmailProvider = providers.includes('email') || providers.length === 0;
  const hasGoogle = providers.includes('google');

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

  useEffect(() => {
    if (resetResendSec <= 0) return;
    const t = window.setInterval(() => {
      setResetResendSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resetResendSec]);

  const handleResetEmail = async () => {
    if (!user?.email) {
      setPasswordError('No email on this account.');
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    setResetEmailSent(false);
    const { error } = await resetPassword(user.email.trim());
    setPasswordBusy(false);
    if (error) {
      setPasswordError(
        error.message.includes('rate')
          ? 'Too many requests — wait a few minutes and try again.'
          : error.message
      );
      return;
    }
    setResetEmailSent(true);
    setResetResendSec(60);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 8) {
      setPasswordError('Use at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setPasswordBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setPasswordBusy(false);
      setPasswordError('Session expired — sign in again, then retry.');
      return;
    }
    const { error } = await updatePassword(newPassword);
    setPasswordBusy(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('same') || msg.includes('different')) {
        setPasswordError('Choose a different password than your current one.');
      } else if (msg.includes('weak') || msg.includes('password')) {
        setPasswordError(error.message);
      } else {
        setPasswordError(error.message || 'Could not update password. Try the email reset link.');
      }
      return;
    }
    setPasswordSuccess(true);
    setNewPassword('');
    setConfirmPassword('');
    window.setTimeout(() => setPasswordSuccess(false), 5000);
  };

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
  const maskedEmail = user?.email ?? '—';

  return (
    <TerminalModalFrame
      title="Security"
      subtitle="Password, email, and sign-in activity"
      onClose={onClose}
      icon={<Shield size={18} />}
      wide
    >
      <div className="term-security-modal">
        <div className="term-security-account-card">
          <div className="term-security-account-row">
            <span className="term-security-account-label">Signed in as</span>
            <span className="term-security-account-email">{maskedEmail}</span>
          </div>
          <div className="term-security-badges">
            {hasGoogle && <span className="term-security-badge">Google</span>}
            {hasEmailProvider && <span className="term-security-badge">Email & password</span>}
          </div>
        </div>

        <section className="term-security-block">
          <div className="term-security-block-head">
            <KeyRound size={18} aria-hidden />
            <div>
              <h3 className="term-security-block-title">Reset password by email</h3>
              <p className="term-security-block-desc">
                We send a secure link to <strong>{maskedEmail}</strong>. Open it on this device,
                then set a new password on the reset page.
              </p>
            </div>
          </div>

          {resetEmailSent ? (
            <div className="term-security-success-box" role="status">
              <CheckCircle size={20} aria-hidden />
              <div>
                <p className="term-security-success-title">Check your inbox</p>
                <p className="term-security-success-text">
                  If you don&apos;t see it within a few minutes, check spam. The link expires after
                  a short time.
                </p>
                <ol className="term-security-steps">
                  <li>Open the email from Monadier / Supabase</li>
                  <li>Tap the reset link (opens this site)</li>
                  <li>Enter your new password and confirm</li>
                </ol>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className="term-modal-primary term-security-primary-btn"
            disabled={passwordBusy || resetResendSec > 0 || !user?.email}
            onClick={handleResetEmail}
          >
            {passwordBusy ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Sending…
              </>
            ) : resetResendSec > 0 ? (
              `Resend available in ${resetResendSec}s`
            ) : resetEmailSent ? (
              <>
                <Mail size={16} /> Send another link
              </>
            ) : (
              <>
                <Mail size={16} /> Send password reset email
              </>
            )}
          </button>
        </section>

        <section className="term-security-block">
          <div className="term-security-block-head">
            <Lock size={18} aria-hidden />
            <div>
              <h3 className="term-security-block-title">Change password now</h3>
              <p className="term-security-block-desc">
                {hasGoogle && !hasEmailProvider
                  ? 'You sign in with Google. Use the email reset above to add or change a password.'
                  : 'Update immediately while you are signed in (no email required).'}
              </p>
            </div>
          </div>

          <div className="term-security-fields">
            <label className="term-profile-label" htmlFor="sec-new-pw">
              New password
            </label>
            <div className="term-profile-input-wrap">
              <input
                id="sec-new-pw"
                className="term-profile-input"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(null);
                }}
              />
              <button
                type="button"
                className="term-profile-eye"
                onClick={() => setShowPasswords((v) => !v)}
                aria-label={showPasswords ? 'Hide password' : 'Show password'}
              >
                {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <label className="term-profile-label" htmlFor="sec-confirm-pw">
              Confirm password
            </label>
            <input
              id="sec-confirm-pw"
              className="term-profile-input"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPasswordError(null);
              }}
            />

            <button
              type="button"
              className="term-modal-secondary term-security-secondary-btn"
              disabled={
                passwordBusy ||
                !newPassword ||
                !confirmPassword ||
                (hasGoogle && !hasEmailProvider)
              }
              onClick={handleChangePassword}
            >
              {passwordBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : passwordSuccess ? (
                <>
                  <CheckCircle size={16} /> Password updated
                </>
              ) : (
                'Save new password'
              )}
            </button>
          </div>

          {passwordError && (
            <p className="term-security-alert term-security-alert--err">
              <AlertCircle size={14} /> {passwordError}
            </p>
          )}
        </section>

        <section className="term-security-block term-security-block--muted">
          <h3 className="term-security-block-title">Login history</h3>
          <p className="term-security-block-desc">
            Recent sign-ins on this account. Contact{' '}
            <a href="mailto:support@monadier.com" className="term-security-inline-link">
              support@monadier.com
            </a>{' '}
            if you see activity you don&apos;t recognize.
          </p>

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
        </section>

        <p className="term-security-foot">
          Forgot how you signed up?{' '}
          <Link to="/forgot-password" className="term-security-inline-link" onClick={onClose}>
            Reset from login page
            <ExternalLink size={12} className="inline ml-0.5" />
          </Link>
        </p>
      </div>
    </TerminalModalFrame>
  );
};

export default TerminalSecurityModal;
