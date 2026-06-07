import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import Button from '../components/ui/Button';
import Logo from '../components/ui/Logo';
import { updatePassword, supabase } from '../lib/supabase';
import { getAppEntryPath } from '../lib/appUrls';

const ResetPasswordPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);
  const navigate = useNavigate();

  // Wait for recovery session (tokens may still be parsing from URL hash)
  useEffect(() => {
    let settled = false;

    const markValid = () => {
      if (!settled) {
        settled = true;
        setIsValidSession(true);
      }
    };

    const markInvalid = () => {
      if (!settled) {
        settled = true;
        setIsValidSession(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        const isRecovery =
          window.location.hash.includes('type=recovery') || event === 'PASSWORD_RECOVERY';
        if (isRecovery) markValid();
      }
    });

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const hashRecovery = window.location.hash.includes('type=recovery');
      if (session && hashRecovery) {
        markValid();
        return;
      }
      // Give Supabase time to parse hash from email link
      await new Promise((r) => setTimeout(r, 1500));
      const { data: { session: retry } } = await supabase.auth.getSession();
      if (retry && (hashRecovery || window.location.hash.includes('access_token'))) {
        markValid();
      } else if (!settled) {
        markInvalid();
      }
    };

    void checkSession();

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await updatePassword(password);

      if (error) {
        throw error;
      }

      setSuccess(true);

      // Redirect to dashboard after 3 seconds
      setTimeout(() => {
        navigate(getAppEntryPath());
      }, 3000);
    } catch (error: any) {
      setError(error.message || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while checking session
  if (isValidSession === null) {
    return (
      <div className="auth-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  // Invalid or expired link
  if (!isValidSession) {
    return (
      <div className="auth-page">
        <div className="container-custom py-6">
          <Logo size="md" theme="light" />
        </div>

        <div className="flex-grow flex items-center justify-center px-4 py-12">
          <motion.div
            className="w-full max-w-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="auth-card text-center py-8">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="font-display text-2xl mb-3">Invalid or Expired Link</h1>
              <p className="text-secondary mb-6">
                This password reset link is invalid or has expired.<br />
                Please request a new one.
              </p>
              <Link to="/forgot-password">
                <Button variant="primary" fullWidth>
                  Request New Link
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="container-custom py-6">
        <Logo size="md" theme="light" />
      </div>

      <div className="flex-grow flex items-center justify-center px-4 py-12">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="auth-card">
            {success ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h1 className="font-display text-2xl mb-3">Password Updated!</h1>
                <p className="text-secondary mb-6">
                  Your password has been successfully reset.<br />
                  Redirecting you to the dashboard...
                </p>
                <div className="flex items-center justify-center gap-2 text-accent">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Redirecting...</span>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-accent/20 rounded-full flex items-center justify-center">
                    <Lock className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h1 className="font-display text-2xl">Set New Password</h1>
                    <p className="text-secondary text-sm">Choose a strong password for your account.</p>
                  </div>
                </div>

                {error && (
                  <div className="mb-6 p-3 bg-error/10 border border-error/30 rounded-md text-error text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label className="block text-sm text-secondary mb-2">New Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        className="w-full bg-black/[0.04] border border-gray-700 rounded-lg px-4 py-3 pr-12 text-primary placeholder-gray-500 focus:outline-none focus:border-white/30"
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm text-secondary mb-2">Confirm Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      className="w-full bg-black/[0.04] border border-gray-700 rounded-lg px-4 py-3 text-primary placeholder-gray-500 focus:outline-none focus:border-white/30"
                      required
                    />
                  </div>

                  {/* Password strength indicator */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-secondary">Password strength</span>
                      <span className={`${
                        password.length >= 12 ? 'text-green-400' :
                        password.length >= 8 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {password.length >= 12 ? 'Strong' :
                         password.length >= 8 ? 'Good' :
                         password.length > 0 ? 'Weak' : ''}
                      </span>
                    </div>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          password.length >= 12 ? 'bg-green-500 w-full' :
                          password.length >= 8 ? 'bg-yellow-500 w-2/3' :
                          password.length > 0 ? 'bg-red-500 w-1/3' : 'w-0'
                        }`}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    isLoading={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Updating...
                      </>
                    ) : (
                      'Reset Password'
                    )}
                  </Button>
                </form>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
