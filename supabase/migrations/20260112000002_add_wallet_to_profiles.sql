-- Add wallet_address to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_address ON profiles(wallet_address);

-- Create function to sync wallet to subscription
CREATE OR REPLACE FUNCTION sync_wallet_to_subscription()
RETURNS TRIGGER AS $$
BEGIN
  -- When wallet_address is updated in profiles, sync to subscriptions
  IF NEW.wallet_address IS NOT NULL AND NEW.wallet_address != '' THEN
    UPDATE subscriptions
    SET wallet_address = NEW.wallet_address,
        updated_at = NOW()
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_sync_wallet ON profiles;
CREATE TRIGGER trigger_sync_wallet
  AFTER UPDATE OF wallet_address ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_wallet_to_subscription();

-- Also create RPC function for frontend to save wallet
CREATE OR REPLACE FUNCTION save_user_wallet(
  p_user_id UUID,
  p_wallet_address TEXT
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Update profile
  UPDATE profiles
  SET wallet_address = LOWER(p_wallet_address),
      updated_at = NOW()
  WHERE id = p_user_id;

  -- Update subscription
  UPDATE subscriptions
  SET wallet_address = LOWER(p_wallet_address),
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Return success
  SELECT json_build_object(
    'success', true,
    'wallet_address', LOWER(p_wallet_address)
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
