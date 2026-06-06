-- Username: chosen at registration, immutable after set.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (LOWER(username))
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.profiles.username IS 'Public handle; set once at signup, cannot be changed';

-- Normalize + lock username on update
CREATE OR REPLACE FUNCTION public.normalize_username(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT;
BEGIN
  v := lower(trim(COALESCE(raw, '')));
  IF v !~ '^[a-z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'Username must be 3–20 characters: lowercase letters, numbers, underscore only';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_username()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.username IS NOT NULL
     AND NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'Username cannot be changed after it is set';
  END IF;
  IF NEW.username IS NOT NULL THEN
    NEW.username := public.normalize_username(NEW.username);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_username_guard ON public.profiles;
CREATE TRIGGER profiles_username_guard
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_username();

-- Signup trigger: copy username from auth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_username TEXT;
BEGIN
  meta_username := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'username', '')), '');
  IF meta_username IS NOT NULL THEN
    meta_username := public.normalize_username(meta_username);
  END IF;

  INSERT INTO public.profiles (id, email, full_name, country, username, onboarding_completed)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'country', ''),
    meta_username,
    FALSE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(profiles.full_name, ''), EXCLUDED.full_name),
    country = COALESCE(NULLIF(profiles.country, ''), EXCLUDED.country),
    username = COALESCE(profiles.username, EXCLUDED.username),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Availability check (registration)
CREATE OR REPLACE FUNCTION public.is_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE LOWER(username) = public.normalize_username(p_username)
  );
$$;

REVOKE ALL ON FUNCTION public.is_username_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_available(TEXT) TO anon, authenticated;

-- Set username once (OAuth users who skipped registration field)
CREATE OR REPLACE FUNCTION public.set_username_once(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  uid UUID;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_username := public.normalize_username(p_username);

  IF NOT public.is_username_available(v_username) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username is already taken');
  END IF;

  UPDATE public.profiles
  SET username = v_username, updated_at = NOW()
  WHERE id = uid AND username IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username already set or profile missing');
  END IF;

  RETURN jsonb_build_object('success', true, 'username', v_username);
END;
$$;

REVOKE ALL ON FUNCTION public.set_username_once(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_username_once(TEXT) TO authenticated;
