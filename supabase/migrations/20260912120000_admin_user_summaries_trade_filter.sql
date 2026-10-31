-- Admin: richer user rows (P&L, fees, profile fields) + paginated trade history with user filter.

CREATE OR REPLACE FUNCTION public.get_admin_hl_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_day_ago timestamptz := v_now - interval '24 hours';
  v_result jsonb;
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Admin access required'
      USING ERRCODE = '42501';
  END IF;

  v_result := jsonb_build_object(
    'generated_at', v_now,
    'stats', (
      SELECT jsonb_build_object(
        'total_users', (SELECT count(*)::int FROM public.profiles),
        'users_with_wallet', (
          SELECT count(*)::int FROM public.profiles
          WHERE coalesce(wallet_address, '') <> ''
        ),
        'hl_bots_active', (
          SELECT count(*)::int FROM public.vault_settings
          WHERE auto_trade_enabled = true
            AND coalesce(execution_venue, 'hyperliquid') = 'hyperliquid'
        ),
        'hl_bots_total', (
          SELECT count(*)::int FROM public.vault_settings
          WHERE coalesce(execution_venue, 'hyperliquid') = 'hyperliquid'
        ),
        'agents_approved', (
          SELECT count(*)::int FROM public.hl_agent_approvals
          WHERE revoked_at IS NULL
        ),
        'open_positions', (
          SELECT count(*)::int FROM public.positions
          WHERE status IN ('open', 'closing')
        ),
        'closed_trades_24h', (
          SELECT count(*)::int FROM public.trade_history
          WHERE closed_at IS NOT NULL AND closed_at >= v_day_ago
        ),
        'closed_trades_total', (
          SELECT count(*)::int FROM public.trade_history
          WHERE closed_at IS NOT NULL
        ),
        'total_pnl', coalesce((
          SELECT sum(profit_loss)::numeric FROM public.trade_history
          WHERE closed_at IS NOT NULL
        ), 0),
        'pnl_24h', coalesce((
          SELECT sum(profit_loss)::numeric FROM public.trade_history
          WHERE closed_at >= v_day_ago
        ), 0),
        'win_rate', coalesce((
          SELECT round(
            100.0 * count(*) FILTER (WHERE profit_loss > 0)
            / nullif(count(*), 0),
            1
          )
          FROM public.trade_history
          WHERE closed_at IS NOT NULL
        ), 0),
        'hl_fees_accrued_usd', coalesce((
          SELECT sum(coalesce(accrued_fee_usd, success_fee_usd, 0))::numeric
          FROM public.hl_fee_ledger
          WHERE status = 'accrued'
        ), 0),
        'hl_fees_settled_usd', coalesce((
          SELECT sum(success_fee_usd)::numeric FROM public.hl_fee_ledger
          WHERE status = 'settled'
        ), 0),
        'hl_fees_total_usd', coalesce((
          SELECT sum(success_fee_usd)::numeric FROM public.hl_fee_ledger
        ), 0),
        'notifications_pending_email', (
          SELECT count(*)::int FROM public.user_trade_notifications
          WHERE email_sent_at IS NULL
        ),
        'betting_open', (SELECT count(*)::int FROM public.hl_betting_positions),
        'active_subscriptions', (
          SELECT count(*)::int FROM public.subscriptions WHERE status = 'active'
        )
      )
    ),
    'active_bots', coalesce((
      SELECT jsonb_agg(to_jsonb(b))
      FROM (
        SELECT
          lower(vs.wallet_address) AS wallet_address,
          vs.user_id,
          p.email,
          vs.auto_trade_enabled,
          coalesce(vs.execution_venue, 'hyperliquid') AS execution_venue,
          coalesce(vs.leverage_multiplier, 1) AS leverage_multiplier,
          coalesce(vs.take_profit_percent, 0) AS take_profit_percent,
          coalesce(vs.stop_loss_percent, 0) AS stop_loss_percent,
          vs.hl_bot_strategy,
          vs.news_trade_mode,
          vs.updated_at,
          (ha.wallet_address IS NOT NULL) AS agent_approved,
          ha.approved_at AS agent_approved_at,
          ha.expires_at AS agent_expires_at
        FROM public.vault_settings vs
        LEFT JOIN public.profiles p ON p.id = vs.user_id
        LEFT JOIN public.hl_agent_approvals ha
          ON lower(ha.wallet_address) = lower(vs.wallet_address)
          AND ha.revoked_at IS NULL
        WHERE coalesce(vs.execution_venue, 'hyperliquid') = 'hyperliquid'
        ORDER BY vs.auto_trade_enabled DESC, vs.updated_at DESC
        LIMIT 200
      ) b
    ), '[]'::jsonb),
    'open_positions', coalesce((
      SELECT jsonb_agg(to_jsonb(op))
      FROM (
        SELECT
          id,
          lower(wallet_address) AS wallet_address,
          token_symbol,
          coalesce(direction, 'LONG') AS direction,
          status,
          entry_amount,
          entry_price,
          profit_loss,
          profit_loss_percent,
          leverage_multiplier,
          created_at
        FROM public.positions
        WHERE status IN ('open', 'closing')
        ORDER BY created_at DESC
        LIMIT 100
      ) op
    ), '[]'::jsonb),
    'recent_closes', coalesce((
      SELECT jsonb_agg(to_jsonb(c))
      FROM (
        SELECT
          th.id,
          lower(th.wallet_address) AS wallet_address,
          th.token_symbol,
          coalesce(th.direction, 'LONG') AS direction,
          th.profit_loss,
          th.profit_loss_percent,
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
        ORDER BY th.closed_at DESC
        LIMIT 80
      ) c
    ), '[]'::jsonb),
    'recent_events', coalesce((
      SELECT jsonb_agg(to_jsonb(e))
      FROM (
        SELECT
          n.id,
          n.user_id,
          p.email,
          lower(n.wallet_address) AS wallet_address,
          n.kind,
          n.headline,
          n.profit_loss,
          n.profit_loss_percent,
          n.closed_at,
          n.read_at,
          n.email_sent_at,
          n.created_at
        FROM public.user_trade_notifications n
        LEFT JOIN public.profiles p ON p.id = n.user_id
        ORDER BY n.closed_at DESC NULLS LAST, n.created_at DESC
        LIMIT 60
      ) e
    ), '[]'::jsonb),
    'fee_ledger', coalesce((
      SELECT jsonb_agg(to_jsonb(f))
      FROM (
        SELECT
          id,
          lower(wallet_address) AS wallet_address,
          coin,
          gross_profit_usd,
          snapshot_pnl_usd,
          success_fee_usd,
          coalesce(accrued_fee_usd, 0) AS accrued_fee_usd,
          status,
          close_reason,
          created_at,
          settled_at
        FROM public.hl_fee_ledger
        ORDER BY created_at DESC
        LIMIT 500
      ) f
    ), '[]'::jsonb),
    'betting_positions', coalesce((
      SELECT jsonb_agg(to_jsonb(bp))
      FROM (
        SELECT
          id,
          lower(wallet_address) AS wallet_address,
          market_name,
          side_label,
          size,
          entry_px,
          mark_px,
          unrealized_pnl,
          updated_at
        FROM public.hl_betting_positions
        ORDER BY updated_at DESC
        LIMIT 50
      ) bp
    ), '[]'::jsonb),
    'betting_closes', coalesce((
      SELECT jsonb_agg(to_jsonb(bc))
      FROM (
        SELECT
          id,
          lower(wallet_address) AS wallet_address,
          market_name,
          side_label,
          size,
          exit_px,
          realized_pnl,
          closed_at
        FROM public.hl_betting_closes
        ORDER BY closed_at DESC
        LIMIT 40
      ) bc
    ), '[]'::jsonb),
    'users', coalesce((
      SELECT jsonb_agg(to_jsonb(u))
      FROM (
        SELECT
          p.id,
          p.email,
          lower(nullif(trim(p.wallet_address), '')) AS wallet_address,
          p.username,
          p.full_name,
          p.country,
          p.timezone,
          p.kyc_status,
          p.onboarding_completed,
          p.membership_tier,
          coalesce(p.trade_close_email_enabled, true) AS trade_close_email_enabled,
          p.created_at,
          coalesce(th.closed_pnl, 0) AS closed_pnl_total,
          coalesce(th.closed_count, 0)::int AS closed_trades_count,
          coalesce(op.open_count, 0)::int AS open_positions_count,
          coalesce(fee.fees_accrued_usd, 0) AS fees_accrued_usd,
          coalesce(fee.fees_settled_usd, 0) AS fees_settled_usd,
          coalesce(pay.fees_paid_usd, 0) AS fees_paid_usd,
          coalesce(wps.success_win_count, 0)::int AS fee_win_count,
          greatest(0, 20 - coalesce(wps.success_win_count, 0))::int AS wins_until_fee
        FROM public.profiles p
        LEFT JOIN (
          SELECT
            lower(wallet_address) AS w,
            sum(profit_loss) AS closed_pnl,
            count(*)::int AS closed_count
          FROM public.trade_history
          WHERE closed_at IS NOT NULL
            AND (execution_venue IS NULL OR execution_venue = 'hyperliquid')
          GROUP BY 1
        ) th ON th.w = lower(nullif(trim(p.wallet_address), ''))
        LEFT JOIN (
          SELECT lower(wallet_address) AS w, count(*)::int AS open_count
          FROM public.positions
          WHERE status IN ('open', 'closing')
          GROUP BY 1
        ) op ON op.w = lower(nullif(trim(p.wallet_address), ''))
        LEFT JOIN (
          SELECT
            lower(wallet_address) AS w,
            coalesce(sum(coalesce(accrued_fee_usd, success_fee_usd, 0))
              FILTER (WHERE status = 'accrued'), 0) AS fees_accrued_usd,
            coalesce(sum(success_fee_usd) FILTER (WHERE status = 'settled'), 0) AS fees_settled_usd
          FROM public.hl_fee_ledger
          GROUP BY 1
        ) fee ON fee.w = lower(nullif(trim(p.wallet_address), ''))
        LEFT JOIN (
          SELECT lower(wallet_address) AS w, sum(amount_usd) AS fees_paid_usd
          FROM public.platform_fee_payments
          GROUP BY 1
        ) pay ON pay.w = lower(nullif(trim(p.wallet_address), ''))
        LEFT JOIN public.wallet_platform_fee_state wps
          ON lower(wps.wallet_address) = lower(nullif(trim(p.wallet_address), ''))
        ORDER BY coalesce(op.open_count, 0) DESC, p.created_at DESC
        LIMIT 500
      ) u
    ), '[]'::jsonb),
    'subscriptions', coalesce((
      SELECT jsonb_agg(to_jsonb(s))
      FROM (
        SELECT
          id,
          user_id,
          wallet_address,
          plan_tier,
          status,
          billing_cycle,
          start_date,
          end_date
        FROM public.subscriptions
        ORDER BY start_date DESC
        LIMIT 200
      ) s
    ), '[]'::jsonb)
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'admin_dashboard: %', SQLERRM
      USING ERRCODE = SQLSTATE;
END;
$$;

DROP FUNCTION IF EXISTS public.get_admin_hl_trade_history(int, int);

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
    SELECT jsonb_build_object(
      'wallet_address', coalesce(a.wallet_address, prof.wallet_address, v_wallet),
      'email', prof.email,
      'closed_pnl_total', a.closed_pnl_total,
      'closed_trades_count', a.closed_trades_count,
      'open_positions_count', coalesce((
        SELECT count(*)::int FROM public.positions pos
        WHERE lower(pos.wallet_address) = coalesce(a.wallet_address, prof.wallet_address, v_wallet)
          AND pos.status IN ('open', 'closing')
      ), 0),
      'fees_accrued_usd', coalesce((
        SELECT sum(coalesce(l.accrued_fee_usd, l.success_fee_usd, 0))
        FROM public.hl_fee_ledger l
        WHERE lower(l.wallet_address) = coalesce(a.wallet_address, prof.wallet_address, v_wallet)
          AND l.status = 'accrued'
      ), 0),
      'fees_paid_usd', coalesce((
        SELECT sum(fp.amount_usd)
        FROM public.platform_fee_payments fp
        WHERE lower(fp.wallet_address) = coalesce(a.wallet_address, prof.wallet_address, v_wallet)
      ), 0),
      'fee_win_count', coalesce((
        SELECT wps.success_win_count
        FROM public.wallet_platform_fee_state wps
        WHERE lower(wps.wallet_address) = coalesce(a.wallet_address, prof.wallet_address, v_wallet)
      ), 0),
      'wins_until_fee', greatest(0, 20 - coalesce((
        SELECT wps.success_win_count
        FROM public.wallet_platform_fee_state wps
        WHERE lower(wps.wallet_address) = coalesce(a.wallet_address, prof.wallet_address, v_wallet)
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

GRANT EXECUTE ON FUNCTION public.get_admin_hl_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_hl_dashboard() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_admin_hl_trade_history(int, int, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_hl_trade_history(int, int, text, text) TO service_role;

COMMENT ON FUNCTION public.get_admin_hl_trade_history IS
  'Paginated HL trade_history for admin — optional wallet/email filter + per-user stats.';

NOTIFY pgrst, 'reload schema';
