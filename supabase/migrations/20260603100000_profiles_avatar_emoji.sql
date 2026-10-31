-- Profile avatar as emoji (user-selectable in settings)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_emoji TEXT;

COMMENT ON COLUMN public.profiles.avatar_emoji IS 'Single emoji used as profile avatar in dashboard UI';
