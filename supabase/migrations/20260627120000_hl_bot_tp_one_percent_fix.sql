-- 1% take-profit in vault_settings is too tight for HL bot (shows as ~$0.00 PnL).

UPDATE vault_settings
SET take_profit_percent = 5,
    updated_at = NOW()
WHERE take_profit_percent IS NOT NULL
  AND take_profit_percent > 0
  AND take_profit_percent < 2;
