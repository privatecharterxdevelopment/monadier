-- Migration: Free tier total trades limit
-- Date: 2026-01-12
-- Purpose: Add total_trades_used column for free tier (2 trades total, then subscription required)

-- ============================================
-- 1. ADD TOTAL_TRADES_USED COLUMN
-- ============================================

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS total_trades_used INTEGER NOT NULL DEFAULT 0;

-- ============================================
-- 2. UPDATE BOT-SERVICE CONFIG
-- ============================================
-- The bot-service needs to check:
-- - For FREE tier: total_trades_used >= 2 → block
-- - For paid tiers: daily_trades_used >= daily_limit → block

COMMENT ON COLUMN subscriptions.total_trades_used IS 'Total lifetime trades (for free tier: max 2, then subscription required)';

-- ============================================
-- 3. CREATE INDEX FOR EFFICIENT QUERIES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_total_trades ON subscriptions(total_trades_used);
