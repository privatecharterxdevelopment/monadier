-- Old save_vault_trading_settings used GREATEST(0.1, …) so "Off" (0) was stored as 0.1%.
-- Default SL is 0 — only explicit user values should remain.

UPDATE public.vault_settings
SET stop_loss_percent = 0,
    updated_at = now()
WHERE stop_loss_percent = 0.1;
