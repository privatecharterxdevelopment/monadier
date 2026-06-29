import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Logo from '../components/ui/Logo';
import { supabase } from '../lib/supabase';
import { afterAuthGo, OPEN_APP_PATH } from '../lib/appUrls';
import { queueAuthToast } from '../lib/authToast';
import { markPasswordRecoveryPending } from '../lib/passwordRecovery';

/**
 * Finishes Supabase OAuth (Google) and password-recovery redirects.
 */
const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;

    const goToRecovery = () => {
      markPasswordRecoveryPending();
      go('/reset-password?recovery=1');
    };

    const go = (path: string) => {
      if (done) return;
      done = true;
      if (
        path === OPEN_APP_PATH ||
        path.startsWith('/app') ||
        path === '/dashboard' ||
        path.startsWith('/dashboard/') ||
        path === '/dashboard2' ||
        path.startsWith('/dashboard2/')
      ) {
        queueAuthToast('signed_in');
        afterAuthGo(path, navigate);
      } else {
        navigate(path, { replace: true });
      }
    };

    const fail = (message: string) => {
      if (done) return;
      done = true;
      setError(message);
    };

    const isRecovery =
      window.location.hash.includes('type=recovery') ||
      new URLSearchParams(window.location.search).get('type') === 'recovery';

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return;
      if (event === 'PASSWORD_RECOVERY' || isRecovery) {
        goToRecovery();
      } else if (event === 'SIGNED_IN') {
        go(OPEN_APP_PATH);
      }
    });

    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('code')) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
            window.location.href
          );
          if (exchangeError) throw exchangeError;
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (session) {
          if (isRecovery) goToRecovery();
          else go(OPEN_APP_PATH);
          return;
        }

        // Hash-based tokens (some email / legacy flows)
        if (window.location.hash.includes('access_token')) {
          await new Promise((r) => setTimeout(r, 800));
          const { data: { session: retry } } = await supabase.auth.getSession();
          if (retry) {
            if (isRecovery) goToRecovery();
            else go(OPEN_APP_PATH);
            return;
          }
        }

        fail('Sign-in could not be completed. Please try again from the login page.');
      } catch (err: any) {
        console.error('Auth callback error:', err);
        fail(err.message || 'Sign-in failed.');
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
          Back to login
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
