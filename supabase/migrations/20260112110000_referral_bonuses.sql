-- Migration: Referral Bonuses tracking for admin payouts
-- Date: 2026-01-12
-- Purpose: Track $5 bonuses and show wallet addresses for manual USDC payouts

-- ============================================
-- 1. CREATE REFERRAL BONUSES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.referral_bonuses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Bonus details
  amount_usd DECIMAL(10,2) DEFAULT 5.00 NOT NULL,
  bonus_type TEXT NOT NULL CHECK (bonus_type IN ('referrer', 'referred')),

  -- Related referral
  referral_reward_id UUID REFERENCES referral_rewards(id) ON DELETE CASCADE,

  -- User's wallet for payout (copied from profile/subscription for easy admin access)
  wallet_address TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),

  -- Admin tracking
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  paid_tx_hash TEXT,
  paid_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_bonuses_user ON referral_bonuses(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_bonuses_status ON referral_bonuses(status);
CREATE INDEX IF NOT EXISTS idx_referral_bonuses_wallet ON referral_bonuses(wallet_address);

-- Enable RLS
ALTER TABLE public.referral_bonuses ENABLE ROW LEVEL SECURITY;

-- Users can see their own bonuses
CREATE POLICY "Users can view own bonuses" ON public.referral_bonuses
  FOR SELECT USING (auth.uid() = user_id);

-- Service role full access (for admin)
CREATE POLICY "Service role full access to bonuses" ON public.referral_bonuses
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- 2. UPDATE APPLY_REFERRAL_CODE FUNCTION
-- ============================================

-- This function now creates bonus entries for both users
CREATE OR REPLACE FUNCTION apply_referral_code(
  p_referred_user_id UUID,
  p_referral_code TEXT
)
RETURNS JSON AS $$
DECLARE
  v_referrer_id UUID;
  v_reward_id UUID;
  v_referred_wallet TEXT;
  v_referrer_wallet TEXT;
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

  -- Get wallet addresses (from profiles or subscriptions)
  SELECT COALESCE(p.wallet_address, s.wallet_address) INTO v_referred_wallet
  FROM profiles p
  LEFT JOIN subscriptions s ON s.user_id = p.id
  WHERE p.id = p_referred_user_id;

  SELECT COALESCE(p.wallet_address, s.wallet_address) INTO v_referrer_wallet
  FROM profiles p
  LEFT JOIN subscriptions s ON s.user_id = p.id
  WHERE p.id = v_referrer_id;

  -- Create referral reward record
  INSERT INTO referral_rewards (referrer_id, referred_id, referral_code, status)
  VALUES (v_referrer_id, p_referred_user_id, UPPER(p_referral_code), 'pending')
  RETURNING id INTO v_reward_id;

  -- Create bonus for REFERRED user ($5 pending)
  INSERT INTO referral_bonuses (user_id, amount_usd, bonus_type, referral_reward_id, wallet_address, status)
  VALUES (p_referred_user_id, 5.00, 'referred', v_reward_id, v_referred_wallet, 'pending');

  -- Create bonus for REFERRER ($5 pending - will be activated when referred subscribes)
  INSERT INTO referral_bonuses (user_id, amount_usd, bonus_type, referral_reward_id, wallet_address, status)
  VALUES (v_referrer_id, 5.00, 'referrer', v_reward_id, v_referrer_wallet, 'pending');

  RETURN json_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'reward_id', v_reward_id,
    'message', 'Referral applied! $5 bonus pending.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. FUNCTION TO UPDATE WALLET ON BONUSES
-- ============================================

-- When user connects wallet, update their pending bonuses
CREATE OR REPLACE FUNCTION update_bonus_wallets()
RETURNS TRIGGER AS $$
BEGIN
  -- Update any pending bonuses with the new wallet address
  IF NEW.wallet_address IS NOT NULL AND NEW.wallet_address != '' THEN
    UPDATE referral_bonuses
    SET wallet_address = NEW.wallet_address,
        updated_at = NOW()
    WHERE user_id = NEW.id
      AND status = 'pending'
      AND (wallet_address IS NULL OR wallet_address = '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on profiles
DROP TRIGGER IF EXISTS trigger_update_bonus_wallets ON profiles;
CREATE TRIGGER trigger_update_bonus_wallets
  AFTER UPDATE OF wallet_address ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_wallets();

-- ============================================
-- 4. ADMIN VIEW FOR PENDING PAYOUTS
-- ============================================

-- Create a view for easy admin access to pending payouts
CREATE OR REPLACE VIEW admin_pending_payouts AS
SELECT
  rb.id,
  rb.user_id,
  p.email,
  p.full_name,
  rb.amount_usd,
  rb.bonus_type,
  rb.wallet_address,
  rb.status,
  rb.created_at,
  rr.referral_code,
  CASE
    WHEN rb.bonus_type = 'referrer' THEN
      (SELECT email FROM profiles WHERE id = rr.referred_id)
    ELSE
      (SELECT email FROM profiles WHERE id = rr.referrer_id)
  END as other_party_email
FROM referral_bonuses rb
JOIN profiles p ON p.id = rb.user_id
LEFT JOIN referral_rewards rr ON rr.id = rb.referral_reward_id
WHERE rb.status IN ('pending', 'approved')
ORDER BY rb.created_at DESC;

-- ============================================
-- 5. GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON public.referral_bonuses TO authenticated;
GRANT ALL ON public.referral_bonuses TO service_role;
GRANT SELECT ON admin_pending_payouts TO service_role;
