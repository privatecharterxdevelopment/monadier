-- Reassign Lorenzo's primary HL bot wallet (0xf735…) from ipsunlorem@gmail
-- to lorenzo.vanza@hotmail.com so bell + close emails follow the admin account.
-- vault_settings.user_id was already hotmail; user_wallets wrongly pointed at gmail,
-- and resolve_user_id_for_wallet prefers user_wallets first.

DO $$
DECLARE
  v_wallet text := '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c';
  v_gmail uuid := '0a436884-82e5-47b4-8400-e28a14ca48c7';
  v_hotmail uuid := 'd9e105ed-231d-4be4-93d3-713dbc509d4d';
BEGIN
  UPDATE public.user_wallets
  SET user_id = v_hotmail, is_primary = true
  WHERE lower(wallet_address) = v_wallet
    AND user_id = v_gmail;

  UPDATE public.user_trade_notifications
  SET user_id = v_hotmail
  WHERE lower(wallet_address) = v_wallet
    AND user_id = v_gmail;

  UPDATE public.vault_settings
  SET user_id = v_hotmail
  WHERE lower(wallet_address) = v_wallet;
END $$;
