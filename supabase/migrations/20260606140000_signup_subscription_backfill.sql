CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE meta_username TEXT;
BEGIN
  meta_username := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'username', '')), '');
  IF meta_username IS NOT NULL THEN meta_username := public.normalize_username(meta_username); END IF;
  INSERT INTO public.profiles (id, email, full_name, country, username, onboarding_completed)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'country', ''), meta_username, FALSE)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = COALESCE(NULLIF(profiles.full_name, ''), EXCLUDED.full_name),
    country = COALESCE(NULLIF(profiles.country, ''), EXCLUDED.country), username = COALESCE(profiles.username, EXCLUDED.username), updated_at = NOW();
  INSERT INTO public.subscriptions (user_id, plan_tier, billing_cycle, status, start_date, end_date, auto_renew, daily_trades_used, daily_trades_reset_at, total_trades_used, created_at, updated_at)
  VALUES (NEW.id, 'free', 'lifetime', 'active', NOW(), NOW() + INTERVAL '100 years', FALSE, 0, DATE_TRUNC('day', NOW()) + INTERVAL '1 day', 0, NOW(), NOW())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO public.subscriptions (user_id, plan_tier, billing_cycle, status, start_date, end_date, auto_renew, daily_trades_used, daily_trades_reset_at, total_trades_used, created_at, updated_at)
SELECT u.id, 'free', 'lifetime', 'active', NOW(), NOW() + INTERVAL '100 years', FALSE, 0, DATE_TRUNC('day', NOW()) + INTERVAL '1 day', 0, NOW(), NOW()
FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id) ON CONFLICT (user_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.ensure_free_subscription() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.subscriptions (user_id, plan_tier, billing_cycle, status, start_date, end_date, auto_renew, daily_trades_used, daily_trades_reset_at, total_trades_used, created_at, updated_at)
  VALUES (uid, 'free', 'lifetime', 'active', NOW(), NOW() + INTERVAL '100 years', FALSE, 0, DATE_TRUNC('day', NOW()) + INTERVAL '1 day', 0, NOW(), NOW())
  ON CONFLICT (user_id) DO NOTHING;
END; $$;
GRANT EXECUTE ON FUNCTION public.ensure_free_subscription() TO authenticated;
