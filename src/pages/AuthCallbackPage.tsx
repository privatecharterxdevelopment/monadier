import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Logo from '../components/ui/Logo';
import { supabase, ensureUserProfile } from '../lib/supabase';
import { ensureFreeSubscription } from '../lib/ensureSubscription';
import { afterAuthGo, OPEN_APP_PATH } from '../lib/appUrls';
import { queueAuthToast } from '../lib/authToast';
import {
  bootstrapSupabaseAuthFromUrl,
  isPasswordRecoveryPending,
  markPasswordRecoveryPending,
} from '../lib/passwordRecovery';
import type { User } from '@supabase/supabase-js';

/**
 * Finishes Supabase OAuth (Google) and password-recovery redirects.
 * Google users MUST get a profiles row before entering the app.
 */
const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;

    const goToRecovery = () => {
      if (done) return;
      done = true;
      markPasswordRecoveryPending();
      navigate('/reset-password?recovery=1', { replace: true });
    };

    const goApp = () => {
      if (done) return;
      done = true;
      queueAuthToast('signed_in');
      afterAuthGo(OPEN_APP_PATH, navigate);
    };

    const fail = (message: string) => {
      if (done) return;
      done = true;
      setError(message);
    };

    const finishSignedIn = async (user: User) => {
      await ensureUserProfile(user);
      await ensureFreeSubscription().catch(() => undefined);
      goApp();
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) return;
      if (event === 'PASSWORD_RECOVERY') {
        goToRecovery();
        return;
      }
      if (event === 'SIGNED_IN' && !done) {
        void finishSignedIn(session.user).catch((err: unknown) => {
          console.error('[AuthCallback] profile ensure failed', err);
          fail(
            err instanceof Error
              ? err.message
              : 'Account setup failed after Google sign-in. Please try again.'
          );
        });
      }
    });

    const run = async () => {
      try {
        const result = await bootstrapSupabaseAuthFromUrl();

        if (result === 'recovery' || isPasswordRecoveryPending()) {
          goToRecovery();
          return;
        }

        if (result === 'error') {
          fail(
            'Sign-in could not be completed. The link may be invalid or expired — try Google again from the login page.'
          );
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          await finishSignedIn(session.user);
          return;
        }

        if (result === 'sign_in') {
          // Session may arrive via listener a tick later
          return;
        }

        fail('Sign-in could not be completed. Please try again from the login page.');
      } catch (err: unknown) {
        console.error('Auth callback error:', err);
        const message = err instanceof Error ? err.message : 'Sign-in failed.';
        fail(message);
      }
    };

    void run();

    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  if (error) {
    return (
      <div className="auth-page flex flex-col items-center justify-center px-4">
        <Logo size="md" theme="light" />
        <p className="mt-6 text-red-400 text-sm text-center max-w-md">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          className="mt-4 text-accent hover:underline text-sm"
        >
          Back to sign in
        </button>
        <button
          type="button"
          onClick={() => navigate('/forgot-password', { replace: true })}
          className="mt-2 text-secondary hover:underline text-sm"
        >
          Request new reset link
        </button>
      </div>
    );
  }

  return (
    <div className="auth-page flex flex-col items-center justify-center">
      <Logo size="md" theme="light" />
      <Loader2 className="w-8 h-8 text-accent animate-spin mt-6" />
      <p className="text-secondary text-sm mt-3">Completing sign-in…</p>
    </div>
  );
};

export default AuthCallbackPage;
