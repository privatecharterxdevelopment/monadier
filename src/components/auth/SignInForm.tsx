import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { submitSignIn, startGoogleSignIn } from '../../lib/auth/signInFlow';
import GoogleMark from '../ui/GoogleMark';
import AuthPasswordField from './AuthPasswordField';
import { enableDemoMode, isDemoModeAllowed } from '../../lib/demoMode';
import '../../styles/auth-form.css';

export type SignInFormProps = {
  onSignedIn: () => void;
  onSwitchToRegister?: () => void;
  registerHref?: string;
  reason?: string;
  idPrefix?: string;
  className?: string;
  showDemo?: boolean;
  onDemo?: () => void;
  successMessage?: string;
};

/** Single sign-in form for /login and in-app auth modal. */
const SignInForm: React.FC<SignInFormProps> = ({
  onSignedIn,
  onSwitchToRegister,
  registerHref,
  reason,
  idPrefix = 'auth-signin',
  className = '',
  showDemo = false,
  onDemo,
  successMessage,
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const messages = {
    signInFailed: t('auth.signInFailed'),
    googleFailed: t('auth.googleSignInFailed'),
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await submitSignIn(email, password, messages);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSignedIn();
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    const result = await startGoogleSignIn(messages);
    if (!result.ok) {
      setError(result.error);
      setGoogleLoading(false);
    }
  };

  return (
    <div className={`auth-shared-form ${className}`.trim()}>
      {reason ? <p className="hl-signin-reason">{reason}</p> : null}
      {successMessage ? <p className="mb-3 text-sm text-green-700">{successMessage}</p> : null}
      {error ? <p className="hl-signin-error">{error}</p> : null}

      <button
        type="button"
        className="hl-signin-google hl-signin-google--brand"
        onClick={() => void handleGoogle()}
        disabled={googleLoading || isLoading}
      >
        {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <GoogleMark size={18} />}
        {t('auth.signInModal.continueGoogle')}
      </button>

      <div className="hl-signin-divider">
        <span>{t('auth.signInModal.orEmail')}</span>
      </div>

      <form className="hl-signin-form" onSubmit={(e) => void handleSubmit(e)}>
        <label className="term-profile-label" htmlFor={`${idPrefix}-email`}>
          {t('auth.email')}
        </label>
        <input
          id={`${idPrefix}-email`}
          className="term-profile-input hl-signin-input"
          type="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="term-profile-label" htmlFor={`${idPrefix}-password`}>
          {t('auth.password')}
        </label>
        <AuthPasswordField
          id={`${idPrefix}-password`}
          className="hl-signin-input"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
        />

        <p className="hl-signin-forgot">
          <Link to="/forgot-password" className="hl-signin-link-btn">
            {t('auth.forgotPassword')}
          </Link>
        </p>

        <button
          type="submit"
          className="term-modal-primary hl-signin-submit"
          disabled={isLoading || googleLoading}
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            t('auth.signInModal.signInButton')
          )}
        </button>
      </form>

      <p className="hl-signin-foot">
        {t('auth.signInModal.newHere')}{' '}
        {registerHref ? (
          <Link to={registerHref} className="hl-signin-link-btn">
            {t('auth.signInModal.createAccount')}
          </Link>
        ) : (
          <button type="button" className="hl-signin-link-btn" onClick={onSwitchToRegister}>
            {t('auth.signInModal.createAccount')}
          </button>
        )}
      </p>

      {showDemo && isDemoModeAllowed() ? (
        <button
          type="button"
          className="mt-6 w-full py-2.5 text-sm text-[#71717a] hover:text-[#0a0a0a] border border-[#c5c5cb] rounded-full bg-white/40 hover:bg-white/60 transition-colors"
          onClick={() => {
            enableDemoMode();
            onDemo?.();
          }}
        >
          {t('auth.demoDashboard')}
        </button>
      ) : null}
    </div>
  );
};

export default SignInForm;
