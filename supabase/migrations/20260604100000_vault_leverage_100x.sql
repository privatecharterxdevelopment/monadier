-- GMX: allow up to 100x leverage for elite (Pro/Elite/Desktop)

ALTER TABLE vault_settings DROP CONSTRAINT IF EXISTS vault_settings_leverage_multiplier_check;

ALTER TABLE vault_settings ADD CONSTRAINT vault_settings_leverage_multiplier_check
  CHECK (leverage_multiplier >= 1 AND leverage_multiplier <= 100);

COMMENT ON COLUMN vault_settings.leverage_multiplier IS
  'Leverage multiplier (1 = none). Standard max 25x, elite max 100x via GMX.';
