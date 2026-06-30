-- Profit-only HL bot: stop_loss_percent must be 0 (no auto loss exits).

UPDATE public.vault_settings
SET stop_loss_percent = 0,
    updated_at = now()
WHERE coalesce(execution_venue, 'hyperliquid') = 'hyperliquid'
  AND coalesce(stop_loss_percent, 0) > 0;
