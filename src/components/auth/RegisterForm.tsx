import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Loader2, MailCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getStoredReferralCode } from '../../lib/referralCapture';
import { resendSignupConfirmation } from '../../lib/supabase';
import { markWelcomeWalkthroughPending, clearWelcomeWalkthroughPending } from '../../lib/welcomeWalkthrough';
import { submitRegister, startGoogleAuth } from '../../lib/auth/registerFlow';
import GoogleMark from '../ui/GoogleMark';
import AuthPasswordField from './AuthPasswordField';
import '../../styles/auth-form.css';

export type RegisterFormProps = {
  onSessionCreated: () => void;
  onSwitchToSignIn?: () => void;
  signInHref?: string;
  idPrefix?: string;
  className?: string;
  /** Optional parent toast (e.g. TermAuthToast). Local toast always works as fallback. */
  onToast?: (message: string, durationMs?: number) => void;
};

/** Single register form for /register and in-app auth modal. */
const RegisterForm: React.FC<RegisterFormProps> = ({
  onSessionCreated,
  onSwitchToSignIn,
  signInHref,
  idPrefix = 'auth-reg',
  className = '',
  onToast,
}) => {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [awaitingEmailConfirm, setAwaitingEmailConfirm] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendNotice, setResendNotice] = useState('');
  const [localToast, setLocalToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = getStoredReferralCode();
    if (stored) setReferralCode(stored);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const showTermsToast = useCallback(
    (message: string) => {
      if (onToast) {
        onToast(message, 3200);
        return;
      }
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setLocalToast(message);
      toastTimerRef.current = setTimeout(() => setLocalToast(null), 3200);
    },
    [onToast]
  );

  const messages = {
    acceptTermsRequired: t('auth.register.acceptTermsRequired'),
    usernameTaken: t('auth.register.usernameTaken'),
    createFailed: t('auth.register.createFailed'),
    googleFailed: t('auth.googleSignInFailed'),
  };

  const requireTerms = (): boolean => {
    if (acceptedTerms) return true;
    showTermsToast(messages.acceptTermsRequired);
    setError(messages.acceptTermsRequired);
    return false;
  };

  const handleGoogle = async () => {
    setError('');
    if (!requireTerms()) return;
    setGoogleLoading(true);
    markWelcomeWalkthroughPending();
    const result = await startGoogleAuth(messages);
    if (!result.ok) {
      clearWelcomeWalkthroughPending();
      setError(result.error ?? messages.googleFailed);
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!requireTerms()) return;
    setIsLoading(true);
    try {
      const result = await submitRegister(
        { fullName, username, email, password, country, acceptedTerms },
        messages
      );
      if (!result.ok) {
        if (result.error === messages.acceptTermsRequired) {
          showTermsToast(messages.acceptTermsRequired);
        }
        setError(result.error);
        return;
      }
      if (result.kind === 'session') {
        markWelcomeWalkthroughPending();
        onSessionCreated();
        return;
      }
      setAwaitingEmailConfirm(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    setResendNotice('');
    setResendLoading(true);
    try {
      const { error } = await resendSignupConfirmation(email);
      if (error) throw error;
      setResendNotice(t('auth.register.confirmResent'));
    } catch (err: unknown) {
      setResendNotice(
        err instanceof Error ? err.message : t('auth.register.confirmResendFailed')
      );
    } finally {
      setResendLoading(false);
    }
  };

  if (awaitingEmailConfirm) {
    return (
      <div className={`auth-shared-form hl-auth-confirm ${className}`.trim()}>
        <div className="hl-auth-confirm-icon" aria-hidden>
          <MailCheck size={28} />
        </div>
        <p className="hl-auth-confirm-title">{t('auth.register.checkEmail')}</p>
        <p className="hl-auth-confirm-text">
          {t('auth.register.checkEmailDesc', { email })}
        </p>
        <ol className="hl-auth-confirm-steps">
          <li>{t('auth.register.confirmStep1')}</li>
          <li>{t('auth.register.confirmStep2')}</li>
          <li>{t('auth.register.confirmStep3')}</li>
        </ol>
        <p className="hl-auth-confirm-hint">{t('auth.register.confirmSpamHint')}</p>
        {resendNotice ? (
          <p className="hl-auth-confirm-notice" role="status">
            {resendNotice}
          </p>
        ) : null}
        <button
          type="button"
          className="hl-auth-confirm-resend"
          onClick={() => void handleResendConfirmation()}
          disabled={resendLoading}
        >
          {resendLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            t('auth.register.resendConfirmation')
          )}
        </button>
        {signInHref ? (
          <Link to={signInHref} className="term-modal-primary hl-signin-submit">
            {t('auth.register.goToSignIn')}
          </Link>
        ) : (
          <button
            type="button"
            className="term-modal-primary hl-signin-submit"
            onClick={onSwitchToSignIn}
          >
            {t('auth.register.goToSignIn')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`auth-shared-form ${className}`.trim()}>
      {localToast ? (
        <div className="auth-form-toast-wrap" role="status" aria-live="assertive">
          <div className="auth-form-toast">{localToast}</div>
        </div>
      ) : null}

      {referralCode ? (
        <div className="hl-auth-referral">
          <Gift size={14} aria-hidden />
          <span>{t('auth.register.referralApplied')}</span>
        </div>
      ) : null}

      {error ? <p className="hl-signin-error">{error}</p> : null}

      <form className="hl-register-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div className="hl-register-fields">
          <div className="hl-register-field">
            <label className="term-profile-label" htmlFor={`${idPrefix}-name`}>
              {t('auth.register.fullNameLabel')}
            </label>
            <input
              id={`${idPrefix}-name`}
              className="term-profile-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('auth.register.fullNamePlaceholder')}
              required
            />
          </div>

          <div className="hl-register-field">
            <label className="term-profile-label" htmlFor={`${idPrefix}-username`}>
              {t('auth.register.username')}
            </label>
            <input
              id={`${idPrefix}-username`}
              className="term-profile-input"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
              }
              placeholder={t('auth.register.usernamePlaceholder')}
              minLength={3}
              maxLength={20}
              required
            />
            <p className="hl-register-hint">{t('auth.register.usernameHint')}</p>
          </div>

          <div className="hl-register-field">
            <label className="term-profile-label" htmlFor={`${idPrefix}-email`}>
              {t('auth.email')}
            </label>
            <input
              id={`${idPrefix}-email`}
              className="term-profile-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')}
              required
            />
          </div>

          <div className="hl-register-field">
            <label className="term-profile-label" htmlFor={`${idPrefix}-password`}>
              {t('auth.password')}
            </label>
            <AuthPasswordField
              id={`${idPrefix}-password`}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="hl-register-field">
            <label className="term-profile-label" htmlFor={`${idPrefix}-country`}>
              {t('auth.register.country')}
            </label>
            <input
              id={`${idPrefix}-country`}
              className="term-profile-input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder={t('auth.register.countryPlaceholder')}
              required
            />
          </div>

          <label className="hl-register-terms" htmlFor={`${idPrefix}-terms`}>
            <input
              id={`${idPrefix}-terms`}
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              aria-required="true"
            />
            <span>
              {t('auth.register.acceptTerms')}{' '}
              <Link to="/terms" target="_blank" rel="noopener noreferrer">
                {t('auth.register.terms')}
              </Link>{' '}
              {t('auth.register.and')}{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                {t('auth.register.privacy')}
              </Link>
              {t('auth.register.acceptTermsMarketing')}
            </span>
          </label>

          <button
            type="submit"
            className="term-modal-primary hl-signin-submit"
            disabled={isLoading || googleLoading}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : t('auth.register.createAccount')}
          </button>
        </div>
      </form>

      <div className="hl-signin-divider">
        <span>{t('auth.register.orDivider')}</span>
      </div>

      <button
        type="button"
        className="hl-signin-google hl-signin-google--brand"
        onClick={() => void handleGoogle()}
        disabled={isLoading || googleLoading}
      >
        {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <GoogleMark size={18} />}
        {t('auth.continueGoogle')}
      </button>

      <p className="hl-signin-foot">
        {t('auth.register.alreadyHaveAccount')}{' '}
        {signInHref ? (
          <Link to={signInHref} className="hl-signin-link-btn">
            {t('common.signIn')}
          </Link>
        ) : (
          <button type="button" className="hl-signin-link-btn" onClick={onSwitchToSignIn}>
            {t('common.signIn')}
          </button>
        )}
      </p>
    </div>
  );
};

export default RegisterForm;
