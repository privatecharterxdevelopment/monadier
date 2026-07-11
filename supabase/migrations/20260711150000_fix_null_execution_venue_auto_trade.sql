-- Legacy vault_settings often have execution_venue NULL while auto_trade is on.
-- Bot getAutoTradeUsers used to require venue = 'hyperliquid' exactly → only 1 wallet ran.

UPDATE public.vault_settings
SET execution_venue = 'hyperliquid',
    updated_at = now()
WHERE auto_trade_enabled = true
  AND (execution_venue IS NULL OR trim(execution_venue) = '');

COMMENT ON COLUMN public.vault_settings.execution_venue IS
  'hyperliquid (HL bot) | legacy null treated as hyperliquid';
