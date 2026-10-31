-- Faster lookup for active HL bots at scale (1M+ signups)
CREATE INDEX IF NOT EXISTS idx_vault_settings_hl_auto_trade
  ON vault_settings (chain_id, auto_trade_enabled, execution_venue)
  WHERE auto_trade_enabled = true AND execution_venue = 'hyperliquid';
