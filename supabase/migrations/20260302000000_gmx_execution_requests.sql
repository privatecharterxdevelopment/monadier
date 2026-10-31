-- GMX PositionRouter execution lifecycle (V11 bot)
-- Tracks request keys and phases until keeper execution + vault settlement.
-- Idempotent: safe to re-run (IF NOT EXISTS + DROP POLICY IF EXISTS).

CREATE TABLE IF NOT EXISTS gmx_execution_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 42161,
  request_type TEXT NOT NULL CHECK (request_type IN ('increase', 'decrease')),
  phase TEXT NOT NULL CHECK (phase IN (
    'submitted',
    'gmx_executed',
    'vault_finalized',
    'reconciled',
    'failed',
    'timeout'
  )),
  request_key TEXT,
  direction TEXT CHECK (direction IN ('LONG', 'SHORT')),
  submit_tx_hash TEXT,
  finalize_tx_hash TEXT,
  position_id UUID,
  gmx_size TEXT,
  gmx_average_price TEXT,
  gmx_collateral TEXT,
  vault_collateral TEXT,
  usdc_delta TEXT,
  received_amount TEXT,
  pnl_usdc TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmx_exec_wallet ON gmx_execution_requests(wallet_address);
CREATE INDEX IF NOT EXISTS idx_gmx_exec_phase ON gmx_execution_requests(phase);
CREATE INDEX IF NOT EXISTS idx_gmx_exec_request_key ON gmx_execution_requests(request_key);
CREATE INDEX IF NOT EXISTS idx_gmx_exec_pending ON gmx_execution_requests(wallet_address, token_address)
  WHERE phase IN ('submitted');

ALTER TABLE gmx_execution_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages gmx_execution_requests" ON gmx_execution_requests;
CREATE POLICY "Service role manages gmx_execution_requests"
  ON gmx_execution_requests FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Anyone can view gmx_execution_requests" ON gmx_execution_requests;
CREATE POLICY "Anyone can view gmx_execution_requests"
  ON gmx_execution_requests FOR SELECT
  USING (true);
