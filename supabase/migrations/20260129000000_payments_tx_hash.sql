-- Add tx_hash column to payments table for crypto payment tracking
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tx_hash TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_tx_hash ON payments(tx_hash);
CREATE INDEX IF NOT EXISTS idx_payments_wallet ON payments(wallet_address);
CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments(user_id, created_at DESC);
