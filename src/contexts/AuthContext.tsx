import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase, getUserProfile, ensureUserProfile, sendWelcomeEmail } from '../lib/supabase';
import { ensureFreeSubscription } from '../lib/ensureSubscription';
import { isDemoModeEnabled, disableDemoMode } from '../lib/demoMode';
import { applyStoredReferralForUser } from '../lib/referralCapture';
import { emitAuthSignedIn } from '../components/auth/AuthWalletReset';
import { User } from '@supabase/supabase-js';

// Demo account constants
const DEMO_EMAIL = 'amanda.campbell22@gmail.com';
export const DEMO_WALLET_ADDRESS = '0xd3a0000000000000000000000000000000000001';

interface AuthContextType {
  user: User | null;
  profile: any;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True after first getSession() finished — avoids login redirect while session restores */
  sessionReady: boolean;
  isDemoUser: boolean;
  isDemoMode: boolean;
  refreshProfile: () => Promise<Record<string, unknown> | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isAuthenticated: false,
  isLoading: true,
  sessionReady: false,
  isDemoUser: false,
  isDemoMode: false,
  refreshProfile: async () => null,
});

export const useAuth = () => useContext(AuthContext);

const AUTH_SESSION_TIMEOUT_MS = 25_000;
const PROFILE_TIMEOUT_MS = 15_000;
const PROFILE_RETRY_MS = 3_000;
const MAX_PROFILE_RETRIES = 3;

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Request timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

async function fetchProfileRow(userId: string) {
  return withTimeout(getUserProfile(userId), PROFILE_TIMEOUT_MS);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(isDemoModeEnabled);
  const profileLoadSeq = useRef(0);
  const profileRetryTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const syncDemo = () => setIsDemoMode(isDemoModeEnabled());
    window.addEventListener('demoModeChanged', syncDemo);
    window.addEventListener('storage', syncDemo);
    return () => {
      window.removeEventListener('demoModeChanged', syncDemo);
      window.removeEventListener('storage', syncDemo);
    };
  }, []);

  const clearProfileRetries = useCallback(() => {
    profileRetryTimers.current.forEach((id) => clearTimeout(id));
    profileRetryTimers.current = [];
  }, []);

  const hydrateProfile = useCallback(
    async (currentUser: User, attempt = 0) => {
      const seq = ++profileLoadSeq.current;

      try {
        await withTimeout(ensureUserProfile(currentUser), PROFILE_TIMEOUT_MS);
      } catch (error) {
        console.warn('[Auth] ensureUserProfile deferred:', error);
      }

      try {
        const { data, error } = await fetchProfileRow(currentUser.id);
        if (seq !== profileLoadSeq.current) return;
        if (error) {
          console.error('Error fetching profile:', error);
        } else if (data) {
          setProfile(data);
          return;
        }
      } catch (error) {
        if (seq !== profileLoadSeq.current) return;
        console.warn('[Auth] Profile fetch timeout — retrying…', error);
      }

      if (attempt < MAX_PROFILE_RETRIES) {
        const timer = setTimeout(() => {
          void hydrateProfile(currentUser, attempt + 1);
        }, PROFILE_RETRY_MS * (attempt + 1));
        profileRetryTimers.current.push(timer);
      }
    },
    []
  );

  const refreshProfile = useCallback(async () => {
    const userId = user?.id;
    if (!userId) return null;
    try {
      const { data, error } = await fetchProfileRow(userId);
      if (error) {
        console.error('Error refreshing profile:', error);
        return null;
      }
      setProfile(data);
      return data;
    } catch (error) {
      console.warn('Error refreshing profile:', error);
      return null;
    }
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;

    const checkUser = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_SESSION_TIMEOUT_MS
        );
        const currentUser = session?.user ?? null;

        if (!isMounted) return;

        setUser(currentUser);

        if (currentUser) {
          void hydrateProfile(currentUser);
        }
      } catch (error) {
        console.warn('[Auth] Session restore slow — waiting for auth listener:', error);
      } finally {
        if (isMounted) {
          setSessionReady(true);
          setIsLoading(false);
        }
      }
    };

    void checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (nextUser) {
        void hydrateProfile(nextUser);
        void withTimeout(ensureFreeSubscription(), PROFILE_TIMEOUT_MS).catch((e) => {
          console.warn('[Auth] ensureFreeSubscription deferred:', e);
        });

        if (event === 'SIGNED_IN') {
          disableDemoMode();
          emitAuthSignedIn();

          void applyStoredReferralForUser(nextUser.id).then((result) => {
            if (result.success) {
              console.log('[referral] applied on sign-in');
            }
          });

          // Google/OAuth: welcome + admin notify only for brand-new profiles.
          const provider = String(nextUser.app_metadata?.provider ?? '');
          if (provider && provider !== 'email') {
            const key = `hg_admin_signup_mail_${nextUser.id}`;
            try {
              if (!localStorage.getItem(key)) {
                void (async () => {
                  const { data: p } = await supabase
                    .from('profiles')
                    .select('created_at, email, full_name, username, country')
                    .eq('id', nextUser.id)
                    .maybeSingle();
                  const createdMs = p?.created_at ? new Date(p.created_at).getTime() : 0;
                  if (!createdMs || Date.now() - createdMs > 15 * 60 * 1000) return;
                  localStorage.setItem(key, '1');
                  await sendWelcomeEmail(
                    p?.email || nextUser.email || '',
                    String(p?.full_name || nextUser.user_metadata?.full_name || ''),
                    {
                      username: p?.username ? String(p.username) : undefined,
                      country: p?.country ? String(p.country) : undefined,
                      userId: nextUser.id,
                    }
                  );
                })().catch(console.error);
              }
            } catch {
              /* ignore private mode */
            }
          }
        }
      } else {
        profileLoadSeq.current += 1;
        clearProfileRetries();
        setProfile(null);
      }

      setSessionReady(true);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      profileLoadSeq.current += 1;
      clearProfileRetries();
      authListener.subscription.unsubscribe();
    };
  }, [clearProfileRetries, hydrateProfile]);

  const isDemoUser = !!user && user.email === DEMO_EMAIL;

  const value = {
    user,
    profile,
    isAuthenticated: !!user || isDemoMode,
    isLoading,
    sessionReady,
    isDemoUser,
    isDemoMode,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
