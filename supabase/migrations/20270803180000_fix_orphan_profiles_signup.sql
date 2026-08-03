-- Fix orphan auth.users without profiles + harden signup path.
-- Root causes:
-- 1) authenticated never got INSERT on profiles (only SELECT, UPDATE) → client ensureUserProfile fails
-- 2) handle_new_user can throw on bad username metadata and abort profile creation
-- 3) legacy users predating the trigger never got a backfill

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_username TEXT;
  safe_full_name TEXT;
  safe_country TEXT;
BEGIN
  safe_full_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    ''
  );
  safe_country := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'country'), ''), '');

  meta_username := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'username', '')), '');
  IF meta_username IS NOT NULL THEN
    BEGIN
      meta_username := public.normalize_username(meta_username);
    EXCEPTION
      WHEN OTHERS THEN
        meta_username := NULL; -- never block signup on bad username meta
    END;
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, email, full_name, country, username, onboarding_completed)
    VALUES (
      NEW.id,
      NEW.email,
      safe_full_name,
      safe_country,
      meta_username,
      FALSE
    )
    ON CONFLICT (id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, profiles.email),
      full_name = COALESCE(NULLIF(profiles.full_name, ''), EXCLUDED.full_name),
      country = COALESCE(NULLIF(profiles.country, ''), EXCLUDED.country),
      username = COALESCE(profiles.username, EXCLUDED.username),
      updated_at = NOW();
  EXCEPTION
    WHEN unique_violation THEN
      -- username race: insert without username
      INSERT INTO public.profiles (id, email, full_name, country, username, onboarding_completed)
      VALUES (NEW.id, NEW.email, safe_full_name, safe_country, NULL, FALSE)
      ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, profiles.email),
        updated_at = NOW();
    WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user profile insert failed for %: %', NEW.id, SQLERRM;
  END;

  BEGIN
    INSERT INTO public.subscriptions (
      user_id, plan_tier, billing_cycle, status, start_date, end_date,
      auto_renew, daily_trades_used, daily_trades_reset_at, total_trades_used, created_at, updated_at
    )
    VALUES (
      NEW.id, 'free', 'lifetime', 'active', NOW(), NOW() + INTERVAL '100 years',
      FALSE, 0, DATE_TRUNC('day', NOW()) + INTERVAL '1 day', 0, NOW(), NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user subscription insert failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Client-callable ensure (SECURITY DEFINER — works even if INSERT grant flaky)
CREATE OR REPLACE FUNCTION public.ensure_own_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  u_email TEXT;
  u_meta JSONB;
  meta_username TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email, raw_user_meta_data INTO u_email, u_meta
  FROM auth.users WHERE id = uid;

  meta_username := NULLIF(trim(COALESCE(u_meta->>'username', '')), '');
  IF meta_username IS NOT NULL THEN
    BEGIN
      meta_username := public.normalize_username(meta_username);
    EXCEPTION
      WHEN OTHERS THEN
        meta_username := NULL;
    END;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, country, username, onboarding_completed)
  VALUES (
    uid,
    u_email,
    COALESCE(NULLIF(trim(u_meta->>'full_name'), ''), NULLIF(trim(u_meta->>'name'), ''), ''),
    COALESCE(NULLIF(trim(u_meta->>'country'), ''), ''),
    meta_username,
    FALSE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, profiles.email),
    full_name = COALESCE(NULLIF(profiles.full_name, ''), EXCLUDED.full_name),
    country = COALESCE(NULLIF(profiles.country, ''), EXCLUDED.country),
    updated_at = NOW();

  INSERT INTO public.subscriptions (
    user_id, plan_tier, billing_cycle, status, start_date, end_date,
    auto_renew, daily_trades_used, daily_trades_reset_at, total_trades_used, created_at, updated_at
  )
  VALUES (
    uid, 'free', 'lifetime', 'active', NOW(), NOW() + INTERVAL '100 years',
    FALSE, 0, DATE_TRUNC('day', NOW()) + INTERVAL '1 day', 0, NOW(), NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_own_profile() TO authenticated;

-- Backfill orphans
INSERT INTO public.profiles (id, email, full_name, country, username, onboarding_completed)
SELECT
  u.id,
  u.email,
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
    ''
  ),
  COALESCE(NULLIF(trim(u.raw_user_meta_data->>'country'), ''), ''),
  NULL,
  FALSE
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.subscriptions (
  user_id, plan_tier, billing_cycle, status, start_date, end_date,
  auto_renew, daily_trades_used, daily_trades_reset_at, total_trades_used, created_at, updated_at
)
SELECT
  u.id, 'free', 'lifetime', 'active', NOW(), NOW() + INTERVAL '100 years',
  FALSE, 0, DATE_TRUNC('day', NOW()) + INTERVAL '1 day', 0, NOW(), NOW()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;
