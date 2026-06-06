import { useMemo } from 'react';
import type { User } from '@supabase/supabase-js';

type ProfileLike = {
  username?: string | null;
  full_name?: string | null;
  country?: string | null;
  onboarding_completed?: boolean | null;
} | null;

export function useProfileOnboarding(
  profile: ProfileLike,
  user: User | null,
  isDemoUser: boolean
) {
  const needsOnboarding = useMemo(() => {
    if (!user || isDemoUser) return false;

    const hasUsername = Boolean(profile?.username?.trim());
    const hasName = Boolean(profile?.full_name?.trim());
    const hasCountry = Boolean(profile?.country?.trim());
    const profileComplete = hasUsername && hasName && hasCountry;

    if (profile?.onboarding_completed && profileComplete) return false;
    return !profileComplete || !profile?.onboarding_completed;
  }, [profile, user, isDemoUser]);

  return { needsOnboarding };
}
