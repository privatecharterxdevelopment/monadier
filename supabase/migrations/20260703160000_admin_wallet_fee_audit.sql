-- Read-only admin diagnostics: bot trade counts + fee ledger breakdown (does NOT change fee gates).

CREATE OR REPLACE FUNCTION public.get_admin_wallet_fee_audit(p_wallet text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet text := lower(trim(coalesce(p_wallet, '')));
  v_result jsonb;
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  IF v_wallet = '' OR v_wallet !~ '^0x[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'invalid wallet' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'wallet_address', v_wallet,
    'generated_at', now(),
    'profile', (
      SELECT to_jsonb(p)
      FROM (
        SELECT
          p.id,
          p.email,
          lower(nullif(trim(p.wallet_address), '')) AS wallet_address,
          p.membership_tier,
          p.created_at
        FROM public.profiles p
        WHERE lower(coalesce(p.wallet_address, '')) = v_wallet
           OR p.id IN (
             SELECT vs.user_id FROM public.vault_settings vs
             WHERE lower(vs.wallet_address) = v_wallet LIMIT 1
           )
        ORDER BY (lower(coalesce(p.wallet_address, '')) = v_wallet) DESC, p.created_at DESC
        LIMIT 1
      ) p
    ),
    'vault_settings', coalesce((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v.auto_trade_enabled DESC, v.updated_at DESC)
      FROM (
        SELECT
          lower(vs.wallet_address) AS wallet_address,
          vs.user_id,
          vs.chain_id,
          vs.auto_trade_enabled,
          vs.execution_venue,
          vs.hl_bot_strategy,
          vs.updated_at
        FROM public.vault_settings vs
        WHERE lower(vs.wallet_address) = v_wallet
           OR vs.user_id IN (
             SELECT p2.id FROM public.profiles p2
             WHERE lower(coalesce(p2.wallet_address, '')) = v_wallet
           )
      ) v
    ), '[]'::jsonb),
    'fee_exempt', EXISTS (
      SELECT 1 FROM public.platform_fee_waivers w WHERE lower(w.wallet_address) = v_wallet
    ),
    'trade_history', (
      SELECT jsonb_build_object(
        'closed_count', count(*)::int,
        'profitable_count', count(*) FILTER (WHERE coalesce(profit_loss, 0) > 0)::int,
        'closed_pnl_usd', coalesce(sum(profit_loss), 0),
        'last_closed_at', max(closed_at)
      )
      FROM public.trade_history th
      WHERE lower(th.wallet_address) = v_wallet
        AND th.closed_at IS NOT NULL
        AND (th.execution_venue IS NULL OR th.execution_venue = 'hyperliquid')
    ),
    'fee_ledger', (
      SELECT jsonb_build_object(
        'unpaid_bot_wins', count(*) FILTER (
          WHERE fee_source = 'bot' AND status = 'accrued' AND coalesce(success_fee_usd, 0) > 0
        )::int,
        'lifetime_bot_wins', count(*) FILTER (
          WHERE fee_source = 'bot' AND coalesce(success_fee_usd, 0) > 0
        )::int,
        'settled_bot_wins', count(*) FILTER (
          WHERE fee_source = 'bot' AND status = 'settled' AND coalesce(success_fee_usd, 0) > 0
        )::int,
        'fees_accrued_usd', coalesce(sum(coalesce(accrued_fee_usd, success_fee_usd, 0))
          FILTER (WHERE status = 'accrued'), 0),
        'fees_settled_usd', coalesce(sum(success_fee_usd) FILTER (WHERE status = 'settled'), 0),
        'fees_total_usd', coalesce(sum(success_fee_usd), 0)
      )
      FROM public.hl_fee_ledger l
      WHERE lower(l.wallet_address) = v_wallet
    ),
    'fees_paid_usd', coalesce((
      SELECT sum(amount_usd) FROM public.platform_fee_payments fp
      WHERE lower(fp.wallet_address) = v_wallet
    ), 0),
    'cache_state', (
      SELECT to_jsonb(wps)
      FROM (
        SELECT success_win_count, fee_due_email_sent_at, updated_at
        FROM public.wallet_platform_fee_state
        WHERE lower(wallet_address) = v_wallet
      ) wps
    ),
    'recent_ledger_rows', coalesce((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
      FROM (
        SELECT
          l.id,
          l.coin,
          l.gross_profit_usd,
          l.success_fee_usd,
          l.accrued_fee_usd,
          l.builder_fee_usd,
          l.status,
          l.fee_source,
          l.close_reason,
          l.created_at,
          l.settled_at
        FROM public.hl_fee_ledger l
        WHERE lower(l.wallet_address) = v_wallet
        ORDER BY l.created_at DESC
        LIMIT 25
      ) r
    ), '[]'::jsonb),
    'recent_closes', coalesce((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.closed_at DESC)
      FROM (
        SELECT
          th.id,
          th.token_symbol,
          th.direction,
          th.profit_loss,
          th.platform_success_fee,
          th.platform_fee_status,
          th.close_reason,
          th.closed_at
        FROM public.trade_history th
        WHERE lower(th.wallet_address) = v_wallet
          AND th.closed_at IS NOT NULL
        ORDER BY th.closed_at DESC
        LIMIT 25
      ) r
    ), '[]'::jsonb),
    'wallet_mismatch', (
      SELECT jsonb_build_object(
        'profile_wallet', (
          SELECT lower(nullif(trim(p.wallet_address), ''))
          FROM public.profiles p
          JOIN public.vault_settings vs ON vs.user_id = p.id
          WHERE lower(vs.wallet_address) = v_wallet
          LIMIT 1
        ),
        'vault_wallet', v_wallet,
        'trade_wallets', coalesce((
          SELECT jsonb_agg(DISTINCT lower(th.wallet_address))
          FROM public.trade_history th
          JOIN public.profiles p ON p.id IN (
            SELECT vs.user_id FROM public.vault_settings vs WHERE lower(vs.wallet_address) = v_wallet
          )
          WHERE lower(th.wallet_address) <> v_wallet
            AND th.closed_at IS NOT NULL
          LIMIT 5
        ), '[]'::jsonb)
      )
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_wallet_fee_audit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_wallet_fee_audit(text) TO service_role;

COMMENT ON FUNCTION public.get_admin_wallet_fee_audit IS
  'Admin read-only: bot closes, fee ledger, payments, cache — does not mutate fee gates.';

-- Batch stats for dashboard enrich (display only).
CREATE OR REPLACE FUNCTION public.get_admin_wallet_bot_stats(p_wallets text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallets text[];
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  v_wallets := ARRAY(
    SELECT DISTINCT lower(trim(w))
    FROM unnest(coalesce(p_wallets, ARRAY[]::text[])) AS w
    WHERE lower(trim(w)) ~ '^0x[a-f0-9]{40}$'
  );

  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(s))
    FROM (
      SELECT
        w AS wallet_address,
        coalesce(th.closed_count, 0)::int AS bot_closed_trades_count,
        coalesce(th.profitable_count, 0)::int AS bot_profitable_closes,
        coalesce(th.closed_pnl_usd, 0) AS bot_closed_pnl_usd,
        coalesce(lw.lifetime_bot_fee_wins, 0)::int AS lifetime_bot_fee_wins,
        coalesce(uw.unpaid_bot_win_count, 0)::int AS unpaid_bot_fee_wins,
        coalesce(fee.fees_accrued_usd, 0) AS fees_accrued_usd,
        coalesce(fee.fees_settled_usd, 0) AS fees_settled_usd,
        coalesce(pay.fees_paid_usd, 0) AS fees_paid_usd
      FROM unnest(v_wallets) AS w
      LEFT JOIN (
        SELECT
          lower(wallet_address) AS wallet_address,
          count(*)::int AS closed_count,
          count(*) FILTER (WHERE coalesce(profit_loss, 0) > 0)::int AS profitable_count,
          coalesce(sum(profit_loss), 0) AS closed_pnl_usd
        FROM public.trade_history
        WHERE closed_at IS NOT NULL
          AND (execution_venue IS NULL OR execution_venue = 'hyperliquid')
        GROUP BY 1
      ) th ON th.wallet_address = w
      LEFT JOIN (
        SELECT lower(wallet_address) AS wallet_address, count(*)::int AS lifetime_bot_fee_wins
        FROM public.hl_fee_ledger
        WHERE fee_source = 'bot' AND coalesce(success_fee_usd, 0) > 0
        GROUP BY 1
      ) lw ON lw.wallet_address = w
      LEFT JOIN public.wallet_unpaid_bot_fee_wins uw ON uw.wallet_address = w
      LEFT JOIN (
        SELECT
          lower(wallet_address) AS wallet_address,
          coalesce(sum(coalesce(accrued_fee_usd, success_fee_usd, 0))
            FILTER (WHERE status = 'accrued'), 0) AS fees_accrued_usd,
          coalesce(sum(success_fee_usd) FILTER (WHERE status = 'settled'), 0) AS fees_settled_usd
        FROM public.hl_fee_ledger
        GROUP BY 1
      ) fee ON fee.wallet_address = w
      LEFT JOIN (
        SELECT lower(wallet_address) AS wallet_address, sum(amount_usd) AS fees_paid_usd
        FROM public.platform_fee_payments
        GROUP BY 1
      ) pay ON pay.wallet_address = w
    ) s
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_wallet_bot_stats(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_wallet_bot_stats(text[]) TO service_role;

-- Align History tab fee_win_count with hl_fee_ledger (was stale wallet_platform_fee_state cache).
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
  v_resolved_wallet text;
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
        lower(max(ft.wallet_address)) AS wallet_address,
        coalesce(sum(ft.profit_loss), 0) AS closed_pnl_total,
        count(*)::int AS closed_trades_count
      FROM filtered_trades ft
    ),
    prof AS (
      SELECT p.email, lower(coalesce(p.wallet_address, '')) AS wallet_address
      FROM public.profiles p
      WHERE (v_email IS NOT NULL AND coalesce(p.email, '') ILIKE '%' || v_email || '%')
         OR (v_wallet IS NOT NULL AND lower(coalesce(p.wallet_address, '')) LIKE '%' || v_wallet || '%')
      ORDER BY p.created_at DESC
      LIMIT 1
    )
    SELECT coalesce(a.wallet_address, prof.wallet_address, v_wallet)
    INTO v_resolved_wallet
    FROM agg a
    LEFT JOIN prof ON true;

    SELECT jsonb_build_object(
      'wallet_address', v_resolved_wallet,
      'email', (SELECT prof.email FROM prof LIMIT 1),
      'closed_pnl_total', coalesce(a.closed_pnl_total, 0),
      'closed_trades_count', coalesce(a.closed_trades_count, 0),
      'open_positions_count', coalesce((
        SELECT count(*)::int FROM public.positions pos
        WHERE lower(pos.wallet_address) = v_resolved_wallet
          AND pos.status IN ('open', 'closing')
      ), 0),
      'fees_accrued_usd', coalesce((
        SELECT sum(coalesce(l.accrued_fee_usd, l.success_fee_usd, 0))
        FROM public.hl_fee_ledger l
        WHERE lower(l.wallet_address) = v_resolved_wallet
          AND l.status = 'accrued'
      ), 0),
      'fees_paid_usd', coalesce((
        SELECT sum(fp.amount_usd)
        FROM public.platform_fee_payments fp
        WHERE lower(fp.wallet_address) = v_resolved_wallet
      ), 0),
      'fee_win_count', coalesce((
        SELECT unpaid_bot_win_count FROM public.wallet_unpaid_bot_fee_wins
        WHERE wallet_address = v_resolved_wallet
      ), 0),
      'lifetime_bot_fee_wins', coalesce((
        SELECT count(*)::int FROM public.hl_fee_ledger l
        WHERE lower(l.wallet_address) = v_resolved_wallet
          AND l.fee_source = 'bot'
          AND coalesce(l.success_fee_usd, 0) > 0
      ), 0),
      'wins_until_fee', greatest(0, 20 - coalesce((
        SELECT unpaid_bot_win_count FROM public.wallet_unpaid_bot_fee_wins
        WHERE wallet_address = v_resolved_wallet
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

NOTIFY pgrst, 'reload schema';
