-- Migration: Pending Payments tracking
-- Date: 2026-01-12
-- Purpose: Track pending payments for secure verification

-- ============================================
-- 1. CREATE PENDING PAYMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.pending_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  wallet_address TEXT NOT NULL,
  plan_tier TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  expected_amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'failed')),
  tx_hash TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pending_payments_user ON pending_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_payments_wallet ON pending_payments(wallet_address);
CREATE INDEX IF NOT EXISTS idx_pending_payments_status ON pending_payments(status);

-- Enable RLS
ALTER TABLE public.pending_payments ENABLE ROW LEVEL SECURITY;

-- Users can see their own pending payments
CREATE POLICY "Users can view own pending payments" ON public.pending_payments
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own pending payments
CREATE POLICY "Users can create own pending payments" ON public.pending_payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access to pending payments" ON public.pending_payments
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- 2. ADD COLUMNS TO PAYMENTS TABLE
-- ============================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS chain_id INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- ============================================
-- 3. FUNCTION TO EXPIRE OLD PENDING PAYMENTS
-- ============================================

CREATE OR REPLACE FUNCTION expire_pending_payments()
RETURNS void AS $$
BEGIN
  UPDATE pending_payments
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT ON public.pending_payments TO authenticated;
GRANT ALL ON public.pending_payments TO service_role;
