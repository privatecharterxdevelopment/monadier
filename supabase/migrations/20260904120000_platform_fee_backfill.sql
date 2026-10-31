-- Backfill win counter + accrued_fee_usd for wallets with pre-cycle fee ledger rows.

UPDATE hl_fee_ledger
SET accrued_fee_usd = GREATEST(
  0,
  COALESCE(success_fee_usd, 0) - COALESCE(builder_fee_usd, 0)
)
WHERE status = 'accrued'
  AND COALESCE(accrued_fee_usd, 0) <= 0
  AND COALESCE(success_fee_usd, 0) > 0;

INSERT INTO wallet_platform_fee_state (wallet_address, success_win_count, updated_at)
SELECT
  lower(wallet_address),
  count(*)::int,
  now()
FROM hl_fee_ledger
WHERE COALESCE(gross_profit_usd, 0) > 0
GROUP BY lower(wallet_address)
ON CONFLICT (wallet_address) DO UPDATE
SET
  success_win_count = GREATEST(
    wallet_platform_fee_state.success_win_count,
    EXCLUDED.success_win_count
  ),
  updated_at = now();
