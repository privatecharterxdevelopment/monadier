-- Store uPnL at close signal separately from realized HL fill PnL.

ALTER TABLE trade_history
  ADD COLUMN IF NOT EXISTS snapshot_pnl_usd NUMERIC(20, 8);

ALTER TABLE hl_fee_ledger
  ADD COLUMN IF NOT EXISTS snapshot_pnl_usd NUMERIC(20, 8);

COMMENT ON COLUMN trade_history.snapshot_pnl_usd IS 'uPnL when bot fired close; profit_loss is HL fill truth';
COMMENT ON COLUMN hl_fee_ledger.snapshot_pnl_usd IS 'uPnL at trail/close signal; gross_profit_usd is realized fill';
