-- Fix admin trade history filter: user_stats must use the filtered wallet, not max(wallet).

CREATE OR REPLACE FUNCTION public.get_admin_hl_trade_history(
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0,
  p_wallet text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 500));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_wallet text := nullif(lower(trim(p_wallet)), '');
  v_email text := nullif(trim(p_email), '');
  v_total int;
  v_rows jsonb;
  v_user_stats jsonb := null;
  v_stats_wallet text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT count(*)::int
  INTO v_total
  FROM public.trade_history th
  LEFT JOIN public.profiles p
    ON lower(coalesce(p.wallet_address, '')) = lower(th.wallet_address)
  WHERE th.closed_at IS NOT NULL
    AND (th.execution_venue IS NULL OR th.execution_venue = 'hyperliquid')
    AND (v_wallet IS NULL OR lower(th.wallet_address) LIKE '%' || v_wallet || '%')
    AND (v_email IS NULL OR coalesce(p.email, '') ILIKE '%' || v_email || '%');

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
      AND (v_wallet IS NULL OR lower(th.wallet_address) LIKE '%' || v_wallet || '%')
      AND (v_email IS NULL OR coalesce(p.email, '') ILIKE '%' || v_email || '%')
    ORDER BY th.closed_at DESC, th.id DESC
    LIMIT v_limit
    OFFSET v_offset
  ) r;

  IF v_wallet IS NOT NULL OR v_email IS NOT NULL THEN
    SELECT coalesce(
      CASE
        WHEN v_wallet IS NOT NULL AND length(v_wallet) = 42 AND v_wallet LIKE '0x%' THEN v_wallet
        ELSE NULL
      END,
      (
        SELECT lower(coalesce(p.wallet_address, ''))
        FROM public.profiles p
        WHERE coalesce(p.wallet_address, '') <> ''
          AND (
            (v_email IS NOT NULL AND coalesce(p.email, '') ILIKE '%' || v_email || '%')
            OR (v_wallet IS NOT NULL AND lower(coalesce(p.wallet_address, '')) LIKE '%' || v_wallet || '%')
          )
        ORDER BY
          CASE
            WHEN v_wallet IS NOT NULL AND lower(coalesce(p.wallet_address, '')) = v_wallet THEN 0
            WHEN v_email IS NOT NULL AND coalesce(p.email, '') ILIKE v_email THEN 1
            ELSE 2
          END,
          p.created_at DESC
        LIMIT 1
      ),
      v_wallet
    )
    INTO v_stats_wallet;

    WITH filtered_trades AS (
      SELECT th.wallet_address, th.profit_loss
      FROM public.trade_history th
      LEFT JOIN public.profiles p
        ON lower(coalesce(p.wallet_address, '')) = lower(th.wallet_address)
      WHERE th.closed_at IS NOT NULL
        AND (th.execution_venue IS NULL OR th.execution_venue = 'hyperliquid')
        AND (v_wallet IS NULL OR lower(th.wallet_address) LIKE '%' || v_wallet || '%')
        AND (v_email IS NULL OR coalesce(p.email, '') ILIKE '%' || v_email || '%')
    ),
    agg AS (
      SELECT
        coalesce(sum(ft.profit_loss), 0) AS closed_pnl_total,
        count(*)::int AS closed_trades_count
      FROM filtered_trades ft
    ),
    prof AS (
      SELECT p.email, lower(coalesce(p.wallet_address, '')) AS wallet_address
      FROM public.profiles p
      WHERE lower(coalesce(p.wallet_address, '')) = coalesce(v_stats_wallet, '')
         OR (
           v_email IS NOT NULL
           AND coalesce(p.email, '') ILIKE '%' || v_email || '%'
           AND (v_wallet IS NULL OR lower(coalesce(p.wallet_address, '')) LIKE '%' || v_wallet || '%')
         )
      ORDER BY
        CASE WHEN lower(coalesce(p.wallet_address, '')) = coalesce(v_stats_wallet, '') THEN 0 ELSE 1 END,
        p.created_at DESC
      LIMIT 1
    )
    SELECT jsonb_build_object(
      'wallet_address', coalesce(v_stats_wallet, prof.wallet_address, v_wallet),
      'email', prof.email,
      'closed_pnl_total', a.closed_pnl_total,
      'closed_trades_count', a.closed_trades_count,
      'open_positions_count', coalesce((
        SELECT count(*)::int FROM public.positions pos
        WHERE lower(pos.wallet_address) = coalesce(v_stats_wallet, prof.wallet_address, v_wallet)
          AND pos.status IN ('open', 'closing')
      ), 0),
      'fees_accrued_usd', coalesce((
        SELECT sum(coalesce(l.accrued_fee_usd, l.success_fee_usd, 0))
        FROM public.hl_fee_ledger l
        WHERE lower(l.wallet_address) = coalesce(v_stats_wallet, prof.wallet_address, v_wallet)
          AND l.status = 'accrued'
      ), 0),
      'fees_paid_usd', coalesce((
        SELECT sum(fp.amount_usd)
        FROM public.platform_fee_payments fp
        WHERE lower(fp.wallet_address) = coalesce(v_stats_wallet, prof.wallet_address, v_wallet)
      ), 0),
      'fee_win_count', coalesce((
        SELECT wps.success_win_count
        FROM public.wallet_platform_fee_state wps
        WHERE lower(wps.wallet_address) = coalesce(v_stats_wallet, prof.wallet_address, v_wallet)
      ), 0),
      'wins_until_fee', greatest(0, 20 - coalesce((
        SELECT wps.success_win_count
        FROM public.wallet_platform_fee_state wps
        WHERE lower(wps.wallet_address) = coalesce(v_stats_wallet, prof.wallet_address, v_wallet)
      ), 0))::int
    )
    INTO v_user_stats
    FROM agg a
    LEFT JOIN prof ON true;
  END IF;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'user_stats', v_user_stats
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_hl_trade_history(int, int, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_hl_trade_history(int, int, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
