-- Remove burst duplicate trade_history rows (fee-waived reconcile bug) and expose full admin history.

DO $$
DECLARE
  deleted_count int;
BEGIN
  WITH ranked AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY
          lower(wallet_address),
          upper(token_symbol),
          coalesce(direction, 'LONG'),
          round(coalesce(profit_loss, 0)::numeric, 2),
          date_trunc('minute', closed_at)
        ORDER BY closed_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.trade_history
    WHERE closed_at IS NOT NULL
  ),
  doomed AS (
    SELECT id FROM ranked WHERE rn > 1
  )
  DELETE FROM public.trade_history th
  USING doomed d
  WHERE th.id = d.id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'trade_history dedupe removed % duplicate row(s)', deleted_count;
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_hl_trade_history(
  p_limit int DEFAULT 1000,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := greatest(1, least(coalesce(p_limit, 1000), 5000));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_total int;
  v_rows jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT count(*)::int
  INTO v_total
  FROM public.trade_history th
  WHERE th.closed_at IS NOT NULL
    AND (th.execution_venue IS NULL OR th.execution_venue = 'hyperliquid');

  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      th.id,
      lower(th.wallet_address) AS wallet_address,
      th.token_symbol,
      coalesce(th.direction, 'LONG') AS direction,
      th.leverage,
      th.entry_price,
      th.exit_price,
      th.entry_amount,
      th.exit_amount,
      th.profit_loss,
      th.profit_loss_percent,
      th.snapshot_pnl_usd,
      th.close_reason,
      th.execution_venue,
      th.platform_success_fee,
      th.platform_fee_status,
      th.closed_at,
      p.email
    FROM public.trade_history th
    LEFT JOIN public.profiles p
      ON lower(coalesce(p.wallet_address, '')) = lower(th.wallet_address)
    WHERE th.closed_at IS NOT NULL
      AND (th.execution_venue IS NULL OR th.execution_venue = 'hyperliquid')
    ORDER BY th.closed_at DESC, th.id DESC
    LIMIT v_limit
    OFFSET v_offset
  ) r;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_hl_trade_history(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_hl_trade_history(int, int) TO service_role;

COMMENT ON FUNCTION public.get_admin_hl_trade_history IS
  'Paginated Hyperliquid trade_history for admin monitor — full close_reason inline. Requires is_admin().';
