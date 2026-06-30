-- Track when a user was emailed after hitting the 20-win fee gate (avoid duplicate sends per cycle).

ALTER TABLE wallet_platform_fee_state
  ADD COLUMN IF NOT EXISTS fee_due_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN wallet_platform_fee_state.fee_due_email_sent_at IS
  'When user was emailed after 20 unpaid bot win fees accrued; cleared on settlement';
