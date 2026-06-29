-- Admin dashboard hardening (functions only — no table/data changes).
-- Fixes is_admin() for JWT email + adds session check RPC.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  IF v_email = '' THEN
    SELECT lower(trim(coalesce(u.email, p.email, '')))
    INTO v_email
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = v_uid;
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN false;
  END IF;

  RETURN v_email = ANY (ARRAY[
    'ipsunlorem@gmail.com',
    'lorenzo.vanza@hotmail.com'
  ]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

COMMENT ON FUNCTION public.is_admin IS
  'Admin gate for RLS + admin RPCs. Keep emails in sync with VITE_ADMIN_EMAILS.';

CREATE OR REPLACE FUNCTION public.get_admin_session_check()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT jsonb_build_object(
    'uid', auth.uid(),
    'email', lower(trim(coalesce(
      auth.jwt() ->> 'email',
      (SELECT coalesce(u.email, p.email) FROM auth.users u
       LEFT JOIN public.profiles p ON p.id = u.id
       WHERE u.id = auth.uid()),
      ''
    ))),
    'is_admin', coalesce(public.is_admin(), false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_session_check() TO authenticated;

COMMENT ON FUNCTION public.get_admin_session_check IS
  'Lightweight admin session probe for /admin UI (no data snapshot).';

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
          SELECT sum(success_fee_usd)::numeric FROM public.hl_fee_ledger
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
          success_fee_usd,
          status,
          close_reason,
          created_at,
          settled_at
        FROM public.hl_fee_ledger
        ORDER BY created_at DESC
        LIMIT 100
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
          id,
          email,
          wallet_address,
          membership_tier,
          coalesce(trade_close_email_enabled, true) AS trade_close_email_enabled,
          created_at
        FROM public.profiles
        ORDER BY created_at DESC
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
    ), '[]'::jsonb),
    'payments', coalesce((
      SELECT jsonb_agg(to_jsonb(pay))
      FROM (
        SELECT
          id,
          user_id,
          wallet_address,
          plan_tier,
          billing_cycle,
          expected_amount,
          status,
          tx_hash,
          created_at,
          completed_at
        FROM public.pending_payments
        ORDER BY created_at DESC
        LIMIT 200
      ) pay
    ), '[]'::jsonb)
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'admin_dashboard: %', SQLERRM
      USING ERRCODE = SQLSTATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_hl_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_hl_dashboard() TO service_role;

COMMENT ON FUNCTION public.get_admin_hl_dashboard IS
  'Hyperliquid admin snapshot. Requires is_admin(). Read-only aggregate.';

NOTIFY pgrst, 'reload schema';
