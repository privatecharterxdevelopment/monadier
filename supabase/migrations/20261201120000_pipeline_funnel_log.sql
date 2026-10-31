-- Bot pipeline funnel instrumentation — per-cycle stage/direction/coin audit trail.

CREATE TABLE IF NOT EXISTS trading_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  active_bots INTEGER NOT NULL DEFAULT 0,
  global_signals INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_trading_cycles_started ON trading_cycles (started_at DESC);

CREATE TYPE pipeline_funnel_stage AS ENUM (
  'raw_scan',
  'scan',
  'universe',
  'user',
  'pick',
  'open',
  'executed'
);

CREATE TYPE pipeline_funnel_direction AS ENUM ('LONG', 'SHORT');

CREATE TABLE IF NOT EXISTS pipeline_funnel_log (
  id BIGSERIAL PRIMARY KEY,
  cycle_id UUID NOT NULL REFERENCES trading_cycles (id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  coin TEXT NOT NULL,
  stage pipeline_funnel_stage NOT NULL,
  direction pipeline_funnel_direction NOT NULL,
  passed BOOLEAN NOT NULL,
  skip_reason TEXT,
  macro_regime TEXT,
  wallet_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_funnel_cycle ON pipeline_funnel_log (cycle_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_funnel_stage_dir ON pipeline_funnel_log (stage, direction, passed);
CREATE INDEX IF NOT EXISTS idx_pipeline_funnel_skip ON pipeline_funnel_log (skip_reason) WHERE NOT passed;
CREATE INDEX IF NOT EXISTS idx_pipeline_funnel_recorded ON pipeline_funnel_log (recorded_at DESC);

ALTER TABLE trading_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_funnel_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trading_cycles_service_all" ON trading_cycles
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "pipeline_funnel_log_service_all" ON pipeline_funnel_log
  FOR ALL USING (true) WITH CHECK (true);

-- Funnel pass counts per stage and direction.
CREATE OR REPLACE VIEW pipeline_funnel_by_stage AS
SELECT
  cycle_id,
  stage::TEXT AS stage,
  direction::TEXT AS direction,
  COUNT(*) FILTER (WHERE passed) AS passed_count,
  COUNT(*) FILTER (WHERE NOT passed) AS failed_count,
  COUNT(*) AS total_count
FROM pipeline_funnel_log
GROUP BY cycle_id, stage, direction;

-- Skip-reason ranking (aggregated across cycles in a time window via API).
CREATE OR REPLACE VIEW pipeline_funnel_skip_ranking AS
SELECT
  skip_reason,
  direction::TEXT AS direction,
  COUNT(*) AS n
FROM pipeline_funnel_log
WHERE NOT passed AND skip_reason IS NOT NULL
GROUP BY skip_reason, direction;

COMMENT ON TABLE pipeline_funnel_log IS 'Per-cycle bot pipeline funnel — stage/direction/coin pass or skip with gate ID.';
