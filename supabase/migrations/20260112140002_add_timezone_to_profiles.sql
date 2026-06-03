-- Migration: Add timezone to profiles
-- Date: 2026-01-12
-- Purpose: Store user's timezone for accurate daily trade reset times

-- ============================================
-- 1. ADD TIMEZONE COLUMN TO PROFILES
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- ============================================
-- 2. UPDATE SUBSCRIPTIONS TABLE
-- ============================================

-- Add timezone column to subscriptions for quick access during trade checks
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- ============================================
-- 3. FUNCTION TO GET USER'S NEXT RESET TIME
-- ============================================

CREATE OR REPLACE FUNCTION get_next_daily_reset(user_timezone TEXT)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  user_now TIMESTAMPTZ;
  user_midnight TIMESTAMPTZ;
BEGIN
  -- Get current time in user's timezone
  user_now := NOW() AT TIME ZONE COALESCE(user_timezone, 'UTC');

  -- Calculate next midnight in user's timezone
  user_midnight := (DATE(user_now) + INTERVAL '1 day') AT TIME ZONE COALESCE(user_timezone, 'UTC');

  RETURN user_midnight;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. TRIGGER TO SYNC TIMEZONE TO SUBSCRIPTIONS
-- ============================================

CREATE OR REPLACE FUNCTION sync_profile_timezone_to_subscription()
RETURNS TRIGGER AS $$
BEGIN
  -- When profile timezone changes, update subscription
  IF OLD.timezone IS DISTINCT FROM NEW.timezone THEN
    UPDATE subscriptions
    SET timezone = NEW.timezone,
        updated_at = NOW()
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_timezone_trigger ON profiles;
CREATE TRIGGER sync_timezone_trigger
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_timezone_to_subscription();

-- ============================================
-- 5. COMMON TIMEZONE VALUES
-- ============================================

COMMENT ON COLUMN profiles.timezone IS 'IANA timezone identifier (e.g., America/New_York, Europe/Berlin, Asia/Tokyo)';
