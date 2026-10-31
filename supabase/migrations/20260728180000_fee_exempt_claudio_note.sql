-- Claudio Steyskal: no platform trading fees (email-linked wallets resolved in bot-service).
-- Frontend also exempts via FEE_EXEMPT_EMAILS in src/lib/admin.ts.

COMMENT ON TABLE public.platform_fee_waivers IS
  'Wallets exempt from platform fee accrual and trading/withdraw gates. Also see FEE_EXEMPT_EMAILS (claudio.steyskal@icloud.com).';
