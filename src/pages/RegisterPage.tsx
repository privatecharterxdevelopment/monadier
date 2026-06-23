import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Logo from '../components/ui/Logo';
import {
  signUp,
  signInWithGoogle,
  sendWelcomeEmail,
  supabase,
  isUsernameAvailable,
} from '../lib/supabase';
import { validateUsername } from '../lib/username';
import { Gift } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { afterAuthGo, OPEN_APP_PATH } from '../lib/appUrls';
import {
  applyStoredReferralForUser,
  captureReferralFromSearch,
  getStoredReferralCode,
} from '../lib/referralCapture';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
    const ref = searchParams.get('ref') ?? searchParams.get('referral');
    if (ref) {
      captureReferralFromSearch(`?ref=${ref}`);
    }
    const stored = getStoredReferralCode();
    if (stored) setReferralCode(stored);
  }, [searchParams]);

  const handleGoogleSignIn = async () => {
    setError('');
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (error: any) {
      setError(error.message || 'Failed to sign in with Google');
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!acceptedTerms) {
      setError('You must accept the terms and conditions to continue');
      setIsLoading(false);
      return;
    }

    try {
      const usernameErr = validateUsername(username);
      if (usernameErr) {
        setError(usernameErr);
        setIsLoading(false);
        return;
      }

      const available = await isUsernameAvailable(username);
      if (!available) {
        setError('That username is already taken');
        setIsLoading(false);
        return;
      }

      const { data, error } = await signUp(email, password, fullName, country, username);

      if (error) {
        throw error;
      }

      if (data?.session) {
        const { ensureFreeSubscription } = await import('../lib/ensureSubscription');
        void ensureFreeSubscription().catch(console.error);
      }

      sendWelcomeEmail(email, fullName).catch(console.error);

      if (data?.user?.id && getStoredReferralCode()) {
        try {
          const result = await applyStoredReferralForUser(data.user.id);
          if (result.success) {
            addNotification({
              type: 'info',
              title: 'Referral linked',
              message: 'Your referrer earns 2% when you close profitable bot trades.',
            });
          }
        } catch (refError) {
          console.error('Referral code error:', refError);
        }
      }

      if (data?.session) {
        queueAuthToast('signed_in');
        const returnTo = searchParams.get('from');
        afterAuthGo(
          returnTo && returnTo.startsWith('/') ? returnTo : OPEN_APP_PATH,
          navigate
        );
      } else {
        setAwaitingEmailConfirm(true);
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      setError(error.message || 'Failed to create account. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page auth-page--register">
      <div className="auth-page-inner">
        <motion.div
          className="w-full max-w-lg"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="auth-card auth-card--register">
            <div className="auth-card-brand">
              <Logo size="sm" theme="light" />
            </div>

            <h1 className="auth-card-title">Apply for Access</h1>

            {awaitingEmailConfirm ? (
              <div className="text-center py-2">
                <p className="text-green-700 font-medium mb-2">Check your email</p>
                <p className="text-secondary text-sm mb-5">
                  We sent a confirmation link to <span className="text-primary">{email}</span>.
                  Click it, then sign in.
                </p>
                <Link to="/login" className="text-accent hover:underline text-sm">
                  Go to sign in
                </Link>
              </div>
            ) : (
              <>
                {referralCode && (
                  <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2.5">
                    <Gift className="w-4 h-4 text-green-700 flex-shrink-0" />
                    <div>
                      <p className="text-green-800 font-medium text-sm">Referral linked</p>
                      <p className="text-xs text-secondary">Referrer earns 2% on your profitable bot trades</p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mb-3 p-2.5 bg-error/10 border border-error/30 rounded-md text-error text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="auth-form-grid">
                  <Input
                    label="Full Name"
                    type="text"
                    id="fullName"
                    placeholder="John Smith"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />

                  <Input
                    label="Username"
                    type="text"
                    id="username"
                    placeholder="trader_jane"
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    }
                    minLength={3}
                    maxLength={20}
                    required
                  />

                  <p className="auth-form-span-2 auth-form-hint">
                    3–20 chars, lowercase, numbers, underscore. Cannot be changed later.
                  </p>

                  <Input
                    label="Email"
                    type="email"
                    id="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />

                  <Input
                    label="Password"
                    type="password"
                    id="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />

                  <div className="auth-form-span-2">
                    <Input
                      label="Country"
                      type="text"
                      id="country"
                      placeholder="Switzerland"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      required
                    />
                  </div>

                  <div className="auth-form-span-2 auth-form-terms">
                    <label>
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        required
                      />
                      <span>
                        I accept the{' '}
                        <Link to="/terms" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">
                          Terms
                        </Link>{' '}
                        and{' '}
                        <Link to="/privacy" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">
                          Privacy Policy
                        </Link>
                      </span>
                    </label>
                  </div>

                  <div className="auth-form-span-2 auth-form-actions">
                    <Button type="submit" variant="primary" fullWidth isLoading={isLoading}>
                      Create Account
                    </Button>
                  </div>
                </form>

                <div className="auth-divider">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-black/[0.08]" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-white/80 text-secondary">or continue with</span>
                  </div>
                </div>

                <button type="button" onClick={handleGoogleSignIn} className="btn-oauth">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span className="text-[#0a0a0a] text-sm font-medium">Continue with Google</span>
                </button>

                <div className="auth-footer-links">
                  <span>Already have an account? </span>
                  <Link to="/login" className="text-accent hover:underline">
                    Sign In
                  </Link>
                </div>

                <p className="auth-footer-meta">
                  <Link to="/your-funds" className="hover:text-accent underline">
                    How your funds are stored
                  </Link>
                </p>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterPage;
