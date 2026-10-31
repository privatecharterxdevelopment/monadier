-- Migration: Onboarding flow + Referral system
-- Date: 2026-01-12
-- Purpose: Fix profile sync, add onboarding tracking, create referral system

-- ============================================
-- 1. ADD MISSING COLUMNS TO PROFILES
-- ============================================

-- Add country if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT;

-- Add onboarding_completed flag
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Add kyc_status if not exists (for future use)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'pending';

-- Add membership_tier if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS membership_tier TEXT DEFAULT 'standard';

-- ============================================
-- 2. FIX THE HANDLE_NEW_USER TRIGGER
-- ============================================

-- Update function to also copy country from auth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, country, onboarding_completed)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'country', ''),
    FALSE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(profiles.full_name, ''), EXCLUDED.full_name),
    country = COALESCE(NULLIF(profiles.country, ''), EXCLUDED.country);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. REFERRAL CODES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one code per user
  CONSTRAINT unique_user_referral UNIQUE (user_id)
);

-- Create index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id);

-- Enable RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Users can see their own referral code
CREATE POLICY "Users can view own referral code" ON public.referral_codes
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own referral code
CREATE POLICY "Users can create own referral code" ON public.referral_codes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access to referral codes" ON public.referral_codes
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- 4. REFERRAL REWARDS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referred_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referral_code TEXT NOT NULL,

  -- Reward status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'qualified', 'paid', 'expired')),

  -- Reward amounts (in USD cents to avoid float issues)
  referrer_reward_cents INTEGER DEFAULT 500, -- $5.00
  referred_reward_cents INTEGER DEFAULT 500, -- $5.00

  -- Tracking
  referred_subscription_id UUID REFERENCES subscriptions(id),
  referrer_paid_at TIMESTAMPTZ,
  referred_paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate referrals
  CONSTRAINT unique_referral UNIQUE (referred_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referred ON referral_rewards(referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);

-- Enable RLS
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- Users can see referrals they made or received
CREATE POLICY "Users can view own referrals" ON public.referral_rewards
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Service role full access
CREATE POLICY "Service role full access to referral rewards" ON public.referral_rewards
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Allow inserts for tracking (when someone signs up with referral)
CREATE POLICY "Allow referral tracking inserts" ON public.referral_rewards
  FOR INSERT WITH CHECK (true);

-- ============================================
-- 5. FUNCTION TO GENERATE REFERRAL CODE
-- ============================================

CREATE OR REPLACE FUNCTION generate_referral_code(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  exists_count INTEGER;
BEGIN
  -- Check if user already has a code
  SELECT code INTO new_code FROM referral_codes WHERE user_id = p_user_id;
  IF new_code IS NOT NULL THEN
    RETURN new_code;
  END IF;

  -- Generate unique 8-character code
  LOOP
    new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || p_user_id::TEXT) FROM 1 FOR 8));
    SELECT COUNT(*) INTO exists_count FROM referral_codes WHERE code = new_code;
    EXIT WHEN exists_count = 0;
  END LOOP;

  -- Insert the code
  INSERT INTO referral_codes (user_id, code) VALUES (p_user_id, new_code);

  RETURN new_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. FUNCTION TO APPLY REFERRAL ON SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION apply_referral_code(
  p_referred_user_id UUID,
  p_referral_code TEXT
)
RETURNS JSON AS $$
DECLARE
  v_referrer_id UUID;
  result JSON;
BEGIN
  -- Find the referrer
  SELECT user_id INTO v_referrer_id
  FROM referral_codes
  WHERE code = UPPER(p_referral_code);

  IF v_referrer_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  -- Can't refer yourself
  IF v_referrer_id = p_referred_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot use own referral code');
  END IF;

  -- Check if already referred
  IF EXISTS (SELECT 1 FROM referral_rewards WHERE referred_id = p_referred_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Already used a referral code');
  END IF;

  -- Create pending referral reward
  INSERT INTO referral_rewards (referrer_id, referred_id, referral_code, status)
  VALUES (v_referrer_id, p_referred_user_id, UPPER(p_referral_code), 'pending');

  RETURN json_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'message', 'Referral applied! Both will receive $5 after subscription purchase.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. FUNCTION TO MARK REFERRAL AS QUALIFIED
-- ============================================

-- This gets called when referred user purchases a subscription
CREATE OR REPLACE FUNCTION qualify_referral_reward(p_referred_user_id UUID, p_subscription_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE referral_rewards
  SET
    status = 'qualified',
    referred_subscription_id = p_subscription_id,
    updated_at = NOW()
  WHERE referred_id = p_referred_user_id
    AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. UPDATE EXISTING PROFILES (backfill)
-- ============================================

-- Mark existing users with active subscriptions and wallets as onboarding complete
UPDATE profiles p
SET onboarding_completed = TRUE
WHERE EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.user_id = p.id
    AND s.status = 'active'
    AND s.wallet_address IS NOT NULL
)
AND p.full_name IS NOT NULL
AND p.full_name != '';

-- ============================================
-- 9. GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON public.referral_codes TO authenticated;
GRANT INSERT ON public.referral_codes TO authenticated;
GRANT SELECT ON public.referral_rewards TO authenticated;
GRANT INSERT ON public.referral_rewards TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
GRANT ALL ON public.referral_rewards TO service_role;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION generate_referral_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_referral_code(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION qualify_referral_reward(UUID, UUID) TO service_role;
