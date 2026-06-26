import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  signUp,
  signInWithGoogle,
  sendWelcomeEmail,
  supabase,
  isUsernameAvailable,
} from '../../lib/supabase';
import { validateUsername } from '../../lib/username';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTermAuthToast } from '../terminal/TermAuthToast';
import { ensureFreeSubscription } from '../../lib/ensureSubscription';
import { getStoredReferralCode, applyStoredReferralForUser } from '../../lib/referralCapture';
import { dashboardPreview } from '../../assets/landing/dashboardPreview';

type Props = {
  open: boolean;
  onClose: () => void;
  onSwitchToSignIn?: () => void;
  /** Render dialog only — parent supplies backdrop */
  embedded?: boolean;
};

const ProTradeRegisterModal: React.FC<Props> = ({
  open,
  onClose,
  onSwitchToSignIn,
  embedded = false,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const closedForUserRef = useRef(false);
  const { showToast } = useTermAuthToast();
  const { addNotification } = useNotifications();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [awaitingEmailConfirm, setAwaitingEmailConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    const stored = getStoredReferralCode();
    if (stored) setReferralCode(stored);
  }, [open]);

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

  const handleGoogle = async () => {
    setError('');
    try {
      const { error: oauthError } = await signInWithGoogle();
      if (oauthError) throw oauthError;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.googleSignInFailed');
      setError(msg);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!acceptedTerms) {
      setError(t('auth.register.acceptTermsRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const usernameErr = validateUsername(username);
      if (usernameErr) {
        setError(usernameErr);
        return;
      }

      const available = await isUsernameAvailable(username);
      if (!available) {
        setError(t('auth.register.usernameTaken'));
        return;
      }

      const { data, error: signUpError } = await signUp(
        email,
        password,
        fullName,
        country,
        username
      );
      if (signUpError) throw signUpError;

      if (data?.session) {
        void ensureFreeSubscription().catch(console.error);
      }

      sendWelcomeEmail(email, fullName).catch(console.error);

      if (data?.user?.id && getStoredReferralCode()) {
        try {
          const result = await applyStoredReferralForUser(data.user.id);
          if (result.success) {
            addNotification({
              type: 'info',
              title: t('auth.register.referralNotificationTitle'),
              message: t('auth.register.referralNotificationMessage'),
            });
          }
        } catch (refError) {
          console.error('Referral code error:', refError);
        }
      }

      if (data?.session) {
        showToast(t('auth.register.accountCreatedWelcome'), 3000);
        onClose();
      } else {
        setAwaitingEmailConfirm(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.register.createFailedShort');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const dialog = (
      <div
        className="hl-modal hl-auth-modal hl-auth-modal--register"
        role="dialog"
        aria-labelledby="hl-register-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="hl-auth-modal-close" onClick={onClose} aria-label={t('auth.signInModal.close')}>
          <X size={16} />
        </button>

        <div className="hl-auth-modal-split">
          <div className="hl-auth-modal-form">
            <h2 id="hl-register-title" className="hl-auth-modal-title">
              {t('auth.register.modalTitle')}
            </h2>
            <p className="hl-auth-modal-sub">
              {t('auth.register.modalSub')}
            </p>

            {awaitingEmailConfirm ? (
              <div className="hl-auth-confirm">
                <p className="hl-auth-confirm-title">{t('auth.register.checkEmail')}</p>
                <p className="hl-auth-confirm-text">
                  {t('auth.register.checkEmailDesc', { email })}
                </p>
                <button
                  type="button"
                  className="term-modal-primary hl-signin-submit"
                  onClick={() => onSwitchToSignIn?.()}
                >
                  {t('auth.register.goToSignIn')}
                </button>
              </div>
            ) : (
              <>
                {referralCode ? (
                  <div className="hl-auth-referral">
                    <Gift size={14} aria-hidden />
                    <span>{t('auth.register.referralApplied')}</span>
                  </div>
                ) : null}

                {error ? <p className="hl-signin-error">{error}</p> : null}

                <form className="hl-register-form" onSubmit={handleSubmit}>
                  <div className="hl-register-grid">
                    <label className="term-profile-label" htmlFor="hl-reg-name">
                      {t('auth.register.fullNameLabel')}
                    </label>
                    <input
                      id="hl-reg-name"
                      className="term-profile-input"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('auth.register.fullNamePlaceholder')}
                      required
                    />

                    <label className="term-profile-label" htmlFor="hl-reg-username">
                      {t('auth.register.username')}
                    </label>
                    <input
                      id="hl-reg-username"
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
                    <p className="hl-register-hint hl-register-span-2">
                      {t('auth.register.usernameHint')}
                    </p>

                    <label className="term-profile-label" htmlFor="hl-reg-email">
                      {t('auth.email')}
                    </label>
                    <input
                      id="hl-reg-email"
                      className="term-profile-input"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('auth.emailPlaceholder')}
                      required
                    />

                    <label className="term-profile-label" htmlFor="hl-reg-password">
                      {t('auth.password')}
                    </label>
                    <input
                      id="hl-reg-password"
                      className="term-profile-input"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      required
                    />

                    <label className="term-profile-label hl-register-span-2" htmlFor="hl-reg-country">
                      {t('auth.register.country')}
                    </label>
                    <input
                      id="hl-reg-country"
                      className="term-profile-input hl-register-span-2"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder={t('auth.register.countryPlaceholder')}
                      required
                    />

                    <label className="hl-register-terms hl-register-span-2">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        required
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
                      </span>
                    </label>

                    <button
                      type="submit"
                      className="term-modal-primary hl-signin-submit hl-register-span-2"
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 size={14} className="animate-spin" /> : t('auth.register.createAccount')}
                    </button>
                  </div>
                </form>

                <div className="hl-signin-divider">
                  <span>{t('auth.register.orDivider')}</span>
                </div>

                <button type="button" className="hl-signin-google" onClick={handleGoogle}>
                  {t('auth.continueGoogle')}
                </button>

                <p className="hl-signin-foot">
                  {t('auth.register.alreadyHaveAccount')}{' '}
                  <button type="button" className="hl-signin-link-btn" onClick={onSwitchToSignIn}>
                    {t('common.signIn')}
                  </button>
                </p>
              </>
            )}
          </div>

          <aside className="hl-auth-modal-visual" aria-hidden>
            <img
              src={dashboardPreview}
              alt=""
              className="hl-auth-modal-visual-img"
            />
            <div className="hl-auth-modal-visual-overlay">
              <p className="hl-auth-visual-kicker">{t('auth.register.visualKicker')}</p>
              <h3 className="hl-auth-visual-title">{t('auth.register.visualTitle')}</h3>
              <p className="hl-auth-visual-copy">
                {t('auth.register.visualCopy')}
              </p>
            </div>
          </aside>
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

export default ProTradeRegisterModal;
