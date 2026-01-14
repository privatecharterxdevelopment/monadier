-- Admin Policies Migration
-- Allow admin (ipsunlorem@gmail.com) to view all data
-- Migration: 20260116000000_admin_policies.sql

-- ============================================
-- ADMIN EMAIL CHECK FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT email = 'ipsunlorem@gmail.com'
    FROM auth.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PROFILES - Admin can view all
-- ============================================
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR SELECT USING (is_admin());

-- ============================================
-- POSITIONS - Admin can view all
-- ============================================
DROP POLICY IF EXISTS "Admin can view all positions" ON public.positions;
CREATE POLICY "Admin can view all positions" ON public.positions
  FOR SELECT USING (is_admin());

-- ============================================
-- SUBSCRIPTIONS - Admin can view all
-- ============================================
DROP POLICY IF EXISTS "Admin can view all subscriptions" ON public.subscriptions;
CREATE POLICY "Admin can view all subscriptions" ON public.subscriptions
  FOR SELECT USING (is_admin());

-- ============================================
-- VAULT_SETTINGS - Admin can view all
-- ============================================
DROP POLICY IF EXISTS "Admin can view all vault_settings" ON public.vault_settings;
CREATE POLICY "Admin can view all vault_settings" ON public.vault_settings
  FOR SELECT USING (is_admin());

-- ============================================
-- TRADES - Admin can view all
-- ============================================
DROP POLICY IF EXISTS "Admin can view all trades" ON public.trades;
CREATE POLICY "Admin can view all trades" ON public.trades
  FOR SELECT USING (is_admin());

-- ============================================
-- PAYMENTS - Admin can view all
-- ============================================
DROP POLICY IF EXISTS "Admin can view all payments" ON public.payments;
CREATE POLICY "Admin can view all payments" ON public.payments
  FOR SELECT USING (is_admin());

-- ============================================
-- PENDING_PAYMENTS - Admin can view all
-- ============================================
DROP POLICY IF EXISTS "Admin can view all pending_payments" ON public.pending_payments;
CREATE POLICY "Admin can view all pending_payments" ON public.pending_payments
  FOR SELECT USING (is_admin());
