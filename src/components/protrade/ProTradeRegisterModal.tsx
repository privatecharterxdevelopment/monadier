import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Loader2, X } from 'lucide-react';
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
    const stored = localStorage.getItem('referral_code');
    if (stored) setReferralCode(stored.toUpperCase());
  }, [open]);

  useEffect(() => {
    if (!open) {
      closedForUserRef.current = false;
      return;
    }
    if (!user || closedForUserRef.current) return;
    closedForUserRef.current = true;
    showToast('Signed in successfully', 2800);
    onClose();
  }, [open, user, onClose, showToast]);

  if (!open) return null;

  const handleGoogle = async () => {
    setError('');
    try {
      const { error: oauthError } = await signInWithGoogle();
      if (oauthError) throw oauthError;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sign in with Google';
      setError(msg);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!acceptedTerms) {
      setError('You must accept the terms and conditions to continue');
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
        setError('That username is already taken');
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

      if (referralCode && data?.user?.id) {
        try {
          const result = await supabase.rpc('apply_referral_code', {
            p_referred_user_id: data.user.id,
            p_referral_code: referralCode,
          });
          localStorage.removeItem('referral_code');

          if (result.data?.success) {
            addNotification({
              type: 'bonus',
              title: '$5 USDC Bonus!',
              message: 'Welcome bonus credited! Connect your wallet to receive payout.',
              data: { profit: 5 },
            });
          }
        } catch (refError) {
          console.error('Referral code error:', refError);
        }
      }

      if (data?.session) {
        showToast('Account created — welcome!', 3000);
        onClose();
      } else {
        setAwaitingEmailConfirm(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create account';
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
        <button type="button" className="hl-auth-modal-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="hl-auth-modal-split">
          <div className="hl-auth-modal-form">
            <h2 id="hl-register-title" className="hl-auth-modal-title">
              Register
            </h2>
            <p className="hl-auth-modal-sub">
              Create your Monadier account for bot trading and Pro Trade.
            </p>

            {awaitingEmailConfirm ? (
              <div className="hl-auth-confirm">
                <p className="hl-auth-confirm-title">Check your email</p>
                <p className="hl-auth-confirm-text">
                  We sent a confirmation link to <strong>{email}</strong>. Click it, then sign in.
                </p>
                <button
                  type="button"
                  className="term-modal-primary hl-signin-submit"
                  onClick={() => onSwitchToSignIn?.()}
                >
                  Go to sign in
                </button>
              </div>
            ) : (
              <>
                {referralCode ? (
                  <div className="hl-auth-referral">
                    <Gift size={14} aria-hidden />
                    <span>$5 USDC welcome bonus with referral</span>
                  </div>
                ) : null}

                {error ? <p className="hl-signin-error">{error}</p> : null}

                <form className="hl-register-form" onSubmit={handleSubmit}>
                  <div className="hl-register-grid">
                    <label className="term-profile-label" htmlFor="hl-reg-name">
                      Full name
                    </label>
                    <input
                      id="hl-reg-name"
                      className="term-profile-input"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Smith"
                      required
                    />

                    <label className="term-profile-label" htmlFor="hl-reg-username">
                      Username
                    </label>
                    <input
                      id="hl-reg-username"
                      className="term-profile-input"
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                      }
                      placeholder="trader_jane"
                      minLength={3}
                      maxLength={20}
                      required
                    />
                    <p className="hl-register-hint hl-register-span-2">
                      3–20 chars, lowercase, numbers, underscore. Cannot be changed later.
                    </p>

                    <label className="term-profile-label" htmlFor="hl-reg-email">
                      Email
                    </label>
                    <input
                      id="hl-reg-email"
                      className="term-profile-input"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                    />

                    <label className="term-profile-label" htmlFor="hl-reg-password">
                      Password
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
                      Country
                    </label>
                    <input
                      id="hl-reg-country"
                      className="term-profile-input hl-register-span-2"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Switzerland"
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
                        I accept the{' '}
                        <Link to="/terms" target="_blank" rel="noopener noreferrer">
                          Terms
                        </Link>{' '}
                        and{' '}
                        <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                          Privacy Policy
                        </Link>
                      </span>
                    </label>

                    <button
                      type="submit"
                      className="term-modal-primary hl-signin-submit hl-register-span-2"
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Create account'}
                    </button>
                  </div>
                </form>

                <div className="hl-signin-divider">
                  <span>or</span>
                </div>

                <button type="button" className="hl-signin-google" onClick={handleGoogle}>
                  Continue with Google
                </button>

                <p className="hl-signin-foot">
                  Already have an account?{' '}
                  <button type="button" className="hl-signin-link-btn" onClick={onSwitchToSignIn}>
                    Sign in
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
              <p className="hl-auth-visual-kicker">Monadier Pro Trade</p>
              <h3 className="hl-auth-visual-title">Monadier bot + trading terminal</h3>
              <p className="hl-auth-visual-copy">
                Perps, spot, portfolio, and Monadier bot — one trading workspace.
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
