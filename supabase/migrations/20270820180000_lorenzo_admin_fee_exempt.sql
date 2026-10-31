-- Lorenzo admin accounts only: never accrue or collect the 10% platform success fee.
-- Do not touch any other wallet.

INSERT INTO public.platform_fee_waivers (wallet_address, note)
VALUES
  (
    '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c',
    'admin lorenzo.vanza@hotmail.com'
  ),
  (
    '0x492402bd607a72cbf0a90280aae9b7905372829c',
    'admin ipsunlorem@gmail.com'
  )
ON CONFLICT (wallet_address) DO UPDATE
SET note = EXCLUDED.note;

UPDATE public.hl_fee_ledger
SET
  status = 'waived',
  success_fee_usd = 0,
  accrued_fee_usd = 0
WHERE lower(wallet_address) IN (
  '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c',
  '0x492402bd607a72cbf0a90280aae9b7905372829c'
)
  AND status = 'accrued';

UPDATE public.trade_history
SET
  platform_success_fee = NULL,
  platform_fee_status = 'waived'
WHERE lower(wallet_address) IN (
  '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c',
  '0x492402bd607a72cbf0a90280aae9b7905372829c'
)
  AND platform_fee_status = 'accrued';

UPDATE public.wallet_platform_fee_state
SET success_win_count = 0, updated_at = now()
WHERE lower(wallet_address) IN (
  '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c',
  '0x492402bd607a72cbf0a90280aae9b7905372829c'
);
