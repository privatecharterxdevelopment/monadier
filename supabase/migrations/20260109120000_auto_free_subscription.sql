-- Auto-create FREE subscription when new user signs up

-- Function to create free subscription for new users
CREATE OR REPLACE FUNCTION create_free_subscription_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert a free subscription for the new user
  INSERT INTO subscriptions (
    user_id,
    plan_tier,
    billing_cycle,
    status,
    start_date,
    end_date,
    auto_renew,
    daily_trades_used,
    daily_trades_reset_at,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    'free',
    'lifetime', -- Free tier never expires
    'active',
    NOW(),
    NOW() + INTERVAL '100 years', -- Effectively never expires
    false,
    0,
    DATE_TRUNC('day', NOW()) + INTERVAL '1 day',
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING; -- Don't overwrite if subscription exists

  RETURN NEW;
END;
$$;

-- Add unique constraint on user_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_unique'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_free_subscription_for_user();

-- Also create free subscriptions for existing users who don't have one
INSERT INTO subscriptions (
  user_id,
  plan_tier,
  billing_cycle,
  status,
  start_date,
  end_date,
  auto_renew,
  daily_trades_used,
  daily_trades_reset_at,
  created_at,
  updated_at
)
SELECT
  id,
  'free',
  'lifetime',
  'active',
  NOW(),
  NOW() + INTERVAL '100 years',
  false,
  0,
  DATE_TRUNC('day', NOW()) + INTERVAL '1 day',
  NOW(),
  NOW()
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM subscriptions WHERE user_id IS NOT NULL)
ON CONFLICT (user_id) DO NOTHING;
