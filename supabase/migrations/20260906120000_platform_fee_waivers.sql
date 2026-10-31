-- Waive platform fee enforcement for specific wallets (e.g. admin / internal).
CREATE TABLE IF NOT EXISTS public.platform_fee_waivers (
  wallet_address TEXT PRIMARY KEY,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_fee_waivers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.platform_fee_waivers IS 'Wallets exempt from platform fee accrual and trading/withdraw gates';

-- Admin wallet (ipsunlorem@gmail.com)
INSERT INTO public.platform_fee_waivers (wallet_address, note)
VALUES (
  '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c',
  'admin ipsunlorem@gmail.com'
)
ON CONFLICT (wallet_address) DO NOTHING;

UPDATE public.hl_fee_ledger
SET
  status = 'waived',
  accrued_fee_usd = 0
WHERE lower(wallet_address) = '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c'
  AND status = 'accrued';

UPDATE public.wallet_platform_fee_state
SET success_win_count = 0, updated_at = now()
WHERE lower(wallet_address) = '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c';
