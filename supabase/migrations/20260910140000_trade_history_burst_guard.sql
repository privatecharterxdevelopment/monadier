-- Aggressive WLD-style burst dedupe + DB guard against duplicate trade_history inserts.

DO $$
DECLARE
  deleted_count int;
BEGIN
  WITH stems AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY
          lower(wallet_address),
          upper(token_symbol),
          coalesce(direction, 'LONG'),
          round(coalesce(profit_loss, snapshot_pnl_usd, 0)::numeric, 2),
          left(
            regexp_replace(coalesce(close_reason, ''), ' ‖ fill pending$', ''),
            120
          )
        ORDER BY closed_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.trade_history
    WHERE closed_at IS NOT NULL
  )
  DELETE FROM public.trade_history th
  USING stems s
  WHERE th.id = s.id AND s.rn > 1;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'trade_history stem dedupe removed % duplicate row(s)', deleted_count;
END $$;

CREATE OR REPLACE FUNCTION public.guard_trade_history_duplicate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  reason_stem text;
BEGIN
  IF NEW.closed_at IS NULL THEN
    RETURN NEW;
  END IF;

  reason_stem := left(
    regexp_replace(coalesce(NEW.close_reason, ''), ' ‖ fill pending$', ''),
    120
  );

  IF EXISTS (
    SELECT 1
    FROM public.trade_history th
    WHERE lower(th.wallet_address) = lower(NEW.wallet_address)
      AND upper(th.token_symbol) = upper(NEW.token_symbol)
      AND coalesce(th.direction, 'LONG') = coalesce(NEW.direction, 'LONG')
      AND th.closed_at >= NEW.closed_at - interval '24 hours'
      AND th.closed_at <= NEW.closed_at + interval '2 minutes'
      AND left(
        regexp_replace(coalesce(th.close_reason, ''), ' ‖ fill pending$', ''),
        120
      ) = reason_stem
      AND (
        (
          NEW.profit_loss IS NOT NULL
          AND round(coalesce(th.profit_loss, 0)::numeric, 2)
            = round(NEW.profit_loss::numeric, 2)
        )
        OR (
          NEW.profit_loss IS NULL
          AND NEW.platform_fee_status = 'pending_fill'
          AND round(coalesce(th.snapshot_pnl_usd, 0)::numeric, 2)
            = round(coalesce(NEW.snapshot_pnl_usd, 0)::numeric, 2)
        )
      )
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_trade_history_duplicate ON public.trade_history;
CREATE TRIGGER trg_guard_trade_history_duplicate
  BEFORE INSERT ON public.trade_history
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_trade_history_duplicate();

COMMENT ON FUNCTION public.guard_trade_history_duplicate IS
  'Silently skip burst duplicate bot close rows (same wallet/coin/reason/PnL within 24h).';
