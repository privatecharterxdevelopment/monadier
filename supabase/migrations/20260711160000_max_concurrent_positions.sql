-- Per-user concurrent HL bot position slots (2 default, optional 3rd).

ALTER TABLE public.vault_settings
  ADD COLUMN IF NOT EXISTS max_concurrent_positions INTEGER NOT NULL DEFAULT 2;

ALTER TABLE public.vault_settings
  DROP CONSTRAINT IF EXISTS vault_settings_max_concurrent_positions_check;

ALTER TABLE public.vault_settings
  ADD CONSTRAINT vault_settings_max_concurrent_positions_check
  CHECK (max_concurrent_positions >= 2 AND max_concurrent_positions <= 3);

COMMENT ON COLUMN public.vault_settings.max_concurrent_positions IS
  'Max simultaneous HL perp bot positions (2 or 3). Risk % is split across slots. Independent of AI betting budget.';
