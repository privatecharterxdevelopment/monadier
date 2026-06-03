import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, getUserProfile } from '../lib/supabase';
import { isDemoModeEnabled } from '../lib/demoMode';
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
  refreshProfile: async () => null
});

export const useAuth = () => useContext(AuthContext);

// Helper function to add timeout to promises
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), ms)
  );
  return Promise.race([promise, timeout]);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(isDemoModeEnabled);

  useEffect(() => {
    const syncDemo = () => setIsDemoMode(isDemoModeEnabled());
    window.addEventListener('demoModeChanged', syncDemo);
    window.addEventListener('storage', syncDemo);
    return () => {
      window.removeEventListener('demoModeChanged', syncDemo);
      window.removeEventListener('storage', syncDemo);
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    const userId = user?.id;
    if (!userId) return null;
    try {
      const { data, error } = await withTimeout(getUserProfile(userId), 5000);
      if (error) {
        console.error('Error refreshing profile:', error);
        return null;
      }
      setProfile(data);
      return data;
    } catch (error) {
      console.error('Error refreshing profile:', error);
      return null;
    }
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;

    const checkUser = async () => {
      try {
        // Prefer local session (fast); avoid blocking UI on network getUser()
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          4000
        );
        const currentUser = session?.user ?? null;

        if (!isMounted) return;

        setUser(currentUser);

        if (currentUser) {
          try {
            const { data } = await withTimeout(getUserProfile(currentUser.id), 5000);
            if (isMounted) {
              setProfile(data);
            }
          } catch (profileError) {
            console.error('Error fetching profile:', profileError);
          }
        }
      } catch (error) {
        console.error('Error checking auth state:', error);
        // On error, assume not authenticated
        if (isMounted) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          setSessionReady(true);
          setIsLoading(false);
        }
      }
    };

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      setUser(session?.user ?? null);

      if (session?.user) {
        try {
          const { data } = await withTimeout(getUserProfile(session.user.id), 5000);
          if (isMounted) {
            setProfile(data);
          }
        } catch (error) {
          console.error('Error fetching profile on auth change:', error);
        }

        // Apply referral code from localStorage (for Google OAuth flow)
        if (event === 'SIGNED_IN') {
          const storedReferralCode = localStorage.getItem('referral_code');
          if (storedReferralCode) {
            try {
              const result = await supabase.rpc('apply_referral_code', {
                p_referred_user_id: session.user.id,
                p_referral_code: storedReferralCode
              });
              if (result.data?.success) {
                console.log('Referral code applied successfully:', storedReferralCode);
              }
              localStorage.removeItem('referral_code');
            } catch (refError) {
              console.error('Error applying referral code:', refError);
            }
          }
        }
      } else {
        setProfile(null);
      }

      setSessionReady(true);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const isDemoUser = !!user && user.email === DEMO_EMAIL;

  const value = {
    user,
    profile,
    isAuthenticated: !!user || isDemoMode,
    isLoading,
    sessionReady,
    isDemoUser,
    isDemoMode,
    refreshProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
