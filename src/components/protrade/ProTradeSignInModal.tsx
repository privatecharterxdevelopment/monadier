import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { signIn, signInWithGoogle } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTermAuthToast } from '../terminal/TermAuthToast';
import GoogleMark from '../ui/GoogleMark';

type Props = {
  open: boolean;
  onClose: () => void;
  reason?: string;
  onSwitchToRegister?: () => void;
  /** Parent supplies backdrop — avoids double overlay when switching sign in ↔ register */
  embedded?: boolean;
};

const ProTradeSignInModal: React.FC<Props> = ({
  open,
  onClose,
  reason,
  onSwitchToRegister,
  embedded = false,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useTermAuthToast();
  const closedForUserRef = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      closedForUserRef.current = false;
      return;
    }
    if (!user || closedForUserRef.current) return;
    closedForUserRef.current = true;
    showToast(t('auth.signInModal.signedInSuccess'), 2800);
    onClose();
  }, [open, user, onClose, showToast]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) throw signInError;
      showToast(t('auth.signInModal.signedInSuccess'), 2800);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.signInFailed');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const { error: oauthError } = await signInWithGoogle();
      if (oauthError) throw oauthError;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.googleSignInFailed');
      setError(msg);
      setGoogleLoading(false);
    }
  };

  const dialog = (
    <div
      className="hl-modal hl-modal--sm hl-signin-modal hl-signin-modal--modern"
      role="dialog"
      aria-labelledby="hl-signin-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="hl-signin-modern-head">
        <div className="hl-signin-modern-head-copy">
          <p className="hl-signin-modern-kicker">{t('auth.signInModal.kicker')}</p>
          <h2 id="hl-signin-title" className="hl-signin-modern-title">
            {t('auth.signInModal.title')}
          </h2>
          {reason ? <p className="hl-signin-reason">{reason}</p> : null}
        </div>
        <button type="button" className="hl-modal-close" onClick={onClose} aria-label={t('auth.signInModal.close')}>
          <X size={16} />
        </button>
      </div>

      <div className="hl-signin-modern-body">
        {error ? <p className="hl-signin-error">{error}</p> : null}

        <button
          type="button"
          className="hl-signin-google hl-signin-google--brand"
          onClick={handleGoogle}
          disabled={googleLoading || isLoading}
        >
          {googleLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <GoogleMark size={18} />
          )}
          {t('auth.signInModal.continueGoogle')}
        </button>

        <div className="hl-signin-divider">
          <span>{t('auth.signInModal.orEmail')}</span>
        </div>

        <form className="hl-signin-form" onSubmit={handleSubmit}>
          <label className="term-profile-label" htmlFor="hl-signin-email">
            {t('auth.email')}
          </label>
          <input
            id="hl-signin-email"
            className="term-profile-input hl-signin-input"
            type="email"
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="term-profile-label" htmlFor="hl-signin-password">
            {t('auth.password')}
          </label>
          <input
            id="hl-signin-password"
            className="term-profile-input hl-signin-input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            type="submit"
            className="term-modal-primary hl-signin-submit"
            disabled={isLoading || googleLoading}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : t('auth.signInModal.signInButton')}
          </button>
        </form>

        <p className="hl-signin-foot">
          {t('auth.signInModal.newHere')}{' '}
          <button type="button" className="hl-signin-link-btn" onClick={onSwitchToRegister}>
            {t('auth.signInModal.createAccount')}
          </button>
        </p>
      </div>
    </div>
  );

  if (embedded) return dialog;

  return (
    <div className="hl-modal-backdrop hl-modal-backdrop--auth" role="presentation" onClick={onClose}>
      {dialog}
    </div>
  );
};

export default ProTradeSignInModal;
