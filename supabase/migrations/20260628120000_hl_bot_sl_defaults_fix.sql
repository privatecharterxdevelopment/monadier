-- HL bot: 1% stop-loss stops out on noise + ~$0.01 fees on ~$50 accounts.

UPDATE vault_settings
SET stop_loss_percent = 3,
    updated_at = NOW()
WHERE stop_loss_percent IS NOT NULL
  AND stop_loss_percent > 0
  AND stop_loss_percent < 2;

COMMENT ON COLUMN vault_settings.stop_loss_percent IS 'HL bot stop-loss on margin % (min effective 3% for small accounts)';
