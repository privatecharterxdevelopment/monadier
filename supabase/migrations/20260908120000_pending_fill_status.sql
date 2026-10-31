-- pending_fill: HL position flat, fill not indexed yet — reconcile job backfills realized PnL.

COMMENT ON COLUMN trade_history.platform_fee_status IS
  'none | accrued | settled | waived | pending_fill (awaiting HL fill reconcile)';
