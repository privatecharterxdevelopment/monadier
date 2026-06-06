-- One wallet address may only belong to one Monadier account.

-- Remove duplicate wallet rows (keep earliest link per wallet)
DELETE FROM public.user_wallets uw
WHERE uw.id NOT IN (
  SELECT DISTINCT ON (LOWER(wallet_address)) id
  FROM public.user_wallets
  ORDER BY LOWER(wallet_address), created_at ASC
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallets_wallet_unique
  ON public.user_wallets (LOWER(wallet_address));

COMMENT ON INDEX idx_user_wallets_wallet_unique IS
  'Prevents the same on-chain wallet from being linked to multiple user accounts';
