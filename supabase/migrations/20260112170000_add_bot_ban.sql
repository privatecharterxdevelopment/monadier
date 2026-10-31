-- Add bot ban column to vault_settings
-- When user manually closes a position (emergency close), they get banned from bot trading for 24h

ALTER TABLE vault_settings
ADD COLUMN IF NOT EXISTS bot_banned_until TIMESTAMPTZ DEFAULT NULL;

-- Add index for efficient ban checking
CREATE INDEX IF NOT EXISTS idx_vault_settings_bot_banned
ON vault_settings(wallet_address, bot_banned_until)
WHERE bot_banned_until IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN vault_settings.bot_banned_until IS 'Timestamp until which bot trading is banned (after manual emergency close)';
