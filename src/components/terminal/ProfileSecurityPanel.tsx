import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { fetchLoginActivity, type LoginEvent } from '../../lib/loginActivity';
import {
  supabase,
  updatePassword,
  resetPassword,
  getAccountProviders,
} from '../../lib/supabase';

type Props = {
  idPrefix?: string;
  onForgotPasswordClick?: () => void;
  /** credentials = password tools only (login history rendered separately on profile page) */
  mode?: 'all' | 'credentials';
};

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

const ProfileSecurityPanel: React.FC<Props> = ({
  idPrefix = 'profile-sec',
  onForgotPasswordClick,
  mode = 'all',
}) => {
  const { t, i18n } = useTranslation();
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
    if (mode !== 'all' || !user?.id) {
      setEventsLoading(false);
      return;
    }
    (async () => {
      setEventsLoading(true);
      const rows = await fetchLoginActivity(user.id);
      setEvents(rows);
      setEventsLoading(false);
    })();
  }, [user?.id, mode]);

  useEffect(() => {
    if (resetResendSec <= 0) return;
    const t = window.setInterval(() => {
      setResetResendSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resetResendSec]);

  const handleResetEmail = async () => {
    if (!user?.email) {
      setPasswordError(t('profile.security.noEmail'));
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
          ? t('profile.security.rateLimited')
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
      setPasswordError(t('profile.security.minChars'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('profile.security.mismatch'));
      return;
    }
    setPasswordBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setPasswordBusy(false);
      setPasswordError(t('profile.security.sessionExpired'));
      return;
    }
    const { error } = await updatePassword(newPassword);
    setPasswordBusy(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('same') || msg.includes('different')) {
        setPasswordError(t('profile.security.samePassword'));
      } else if (msg.includes('weak') || msg.includes('password')) {
        setPasswordError(error.message);
      } else {
        setPasswordError(error.message || t('profile.security.updateFailed'));
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
  const compact = mode === 'credentials';

  return (
    <div className={`term-security-modal${compact ? ' term-security-modal--compact' : ''}`}>
      <div className="term-security-account-card">
        <span className="term-security-account-email">{maskedEmail}</span>
        <div className="term-security-badges">
          {hasGoogle && <span className="term-security-badge">Google</span>}
          {hasEmailProvider && <span className="term-security-badge">{t('profile.security.emailBadge')}</span>}
        </div>
      </div>

      <section className="term-security-block">
        {compact ? (
          <h3 className="term-security-block-title">{t('profile.security.resetByEmail')}</h3>
        ) : (
          <div className="term-security-block-head">
            <KeyRound size={18} aria-hidden />
            <div>
              <h3 className="term-security-block-title">{t('profile.security.resetPasswordByEmail')}</h3>
              <p className="term-security-block-desc">
                {t('profile.security.resetDesc', { email: maskedEmail })}
              </p>
            </div>
          </div>
        )}

        {resetEmailSent ? (
          <div className="term-security-success-box" role="status">
            <CheckCircle size={20} aria-hidden />
            <div>
              <p className="term-security-success-title">{t('profile.security.checkInbox')}</p>
              <p className="term-security-success-text">
                {t('profile.security.checkInboxText')}
              </p>
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
              <Loader2 size={16} className="animate-spin" /> {t('profile.security.sending')}
            </>
          ) : resetResendSec > 0 ? (
            t('profile.security.resendIn', { sec: resetResendSec })
          ) : resetEmailSent ? (
            <>
              <Mail size={16} /> {t('profile.security.sendAnother')}
            </>
          ) : (
            <>
              <Mail size={16} /> {t('profile.security.sendReset')}
            </>
          )}
        </button>
      </section>

      <section className="term-security-block">
        {compact ? (
          <h3 className="term-security-block-title">{t('profile.security.changePassword')}</h3>
        ) : (
          <div className="term-security-block-head">
            <Lock size={18} aria-hidden />
            <div>
              <h3 className="term-security-block-title">{t('profile.security.changePasswordNow')}</h3>
              <p className="term-security-block-desc">
                {hasGoogle && !hasEmailProvider
                  ? t('profile.security.changeDescGoogle')
                  : t('profile.security.changeDesc')}
              </p>
            </div>
          </div>
        )}

        <div className="term-security-fields">
          <label className="term-profile-label" htmlFor={`${idPrefix}-new-pw`}>
            {t('profile.security.newPassword')}
          </label>
          <div className="term-profile-input-wrap">
            <input
              id={`${idPrefix}-new-pw`}
              className="term-profile-input"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={t('profile.security.pwPlaceholder')}
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
              aria-label={
                showPasswords
                  ? t('profile.security.hidePassword')
                  : t('profile.security.showPassword')
              }
            >
              {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <label className="term-profile-label" htmlFor={`${idPrefix}-confirm-pw`}>
            {t('profile.security.confirmPassword')}
          </label>
          <input
            id={`${idPrefix}-confirm-pw`}
            className="term-profile-input"
            type={showPasswords ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={t('profile.security.pwRepeat')}
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
                <CheckCircle size={16} /> {t('profile.security.passwordUpdated')}
              </>
            ) : (
              t('profile.security.savePassword')
            )}
          </button>
        </div>

        {passwordError && (
          <p className="term-security-alert term-security-alert--err">
            <AlertCircle size={14} /> {passwordError}
          </p>
        )}
      </section>

      {mode === 'all' ? (
        <section className="term-security-block term-security-block--muted">
          <h3 className="term-security-block-title">{t('profile.loginHistoryTitle')}</h3>
          <p className="term-security-block-desc">{t('profile.security.loginHistoryDesc')}</p>

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
        </section>
      ) : null}

      {!compact ? (
        <p className="term-security-foot">
          {t('profile.security.forgotHow')}{' '}
          <Link
            to="/forgot-password"
            className="term-security-inline-link"
            onClick={onForgotPasswordClick}
          >
            {t('profile.security.resetFromLogin')}
            <ExternalLink size={12} className="inline ml-0.5" />
          </Link>
        </p>
      ) : null}
    </div>
  );
};

export default ProfileSecurityPanel;
