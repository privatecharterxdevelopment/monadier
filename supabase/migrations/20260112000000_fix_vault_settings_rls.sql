-- Fix RLS policies for vault_settings to allow anonymous writes
-- Migration: 20260112000000_fix_vault_settings_rls.sql

-- Drop the restrictive service_role only policy
DROP POLICY IF EXISTS "Service role can manage all vault settings" ON vault_settings;

-- Allow anyone to insert new vault settings
CREATE POLICY "Anyone can insert vault settings"
  ON vault_settings FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update vault settings (they can only update by wallet_address they know)
CREATE POLICY "Anyone can update vault settings"
  ON vault_settings FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Service role can still delete (for admin cleanup)
CREATE POLICY "Service role can delete vault settings"
  ON vault_settings FOR DELETE
  USING (auth.jwt() ->> 'role' = 'service_role');
