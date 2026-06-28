-- Admin Hyperliquid dashboard: RLS + secure RPC for /dashboard/monitor

-- ============================================
-- ADMIN SELECT on HL tables
-- ============================================
DROP POLICY IF EXISTS "Admin can view all trade history" ON public.trade_history;
CREATE POLICY "Admin can view all trade history"
  ON public.trade_history FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Admin can view all HL fee ledger" ON public.hl_fee_ledger;
CREATE POLICY "Admin can view all HL fee ledger"
  ON public.hl_fee_ledger FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Admin can view all trade notifications" ON public.user_trade_notifications;
CREATE POLICY "Admin can view all trade notifications"
  ON public.user_trade_notifications FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Admin can view all hl betting positions" ON public.hl_betting_positions;
CREATE POLICY "Admin can view all hl betting positions"
  ON public.hl_betting_positions FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Admin can view all hl betting closes" ON public.hl_betting_closes;
CREATE POLICY "Admin can view all hl betting closes"
  ON public.hl_betting_closes FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Admin can view all hl agent approvals" ON public.hl_agent_approvals;
CREATE POLICY "Admin can view all hl agent approvals"
  ON public.hl_agent_approvals FOR SELECT
  USING (is_admin());

-- ============================================
-- Aggregated HL admin snapshot (single RPC)
-- ============================================
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
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'stats', (
      SELECT jsonb_build_object(
        'total_users', (SELECT count(*)::int FROM profiles),
        'users_with_wallet', (
          SELECT count(*)::int FROM profiles
          WHERE coalesce(wallet_address, '') <> ''
        ),
        'hl_bots_active', (
          SELECT count(*)::int FROM vault_settings
          WHERE auto_trade_enabled = true
            AND coalesce(execution_venue, 'hyperliquid') = 'hyperliquid'
        ),
        'hl_bots_total', (
          SELECT count(*)::int FROM vault_settings
          WHERE coalesce(execution_venue, 'hyperliquid') = 'hyperliquid'
        ),
        'agents_approved', (
          SELECT count(*)::int FROM hl_agent_approvals
          WHERE revoked_at IS NULL
        ),
        'open_positions', (
          SELECT count(*)::int FROM positions
          WHERE status IN ('open', 'closing')
        ),
        'closed_trades_24h', (
          SELECT count(*)::int FROM trade_history
          WHERE closed_at >= v_day_ago
        ),
        'closed_trades_total', (
          SELECT count(*)::int FROM trade_history
          WHERE closed_at IS NOT NULL
        ),
        'total_pnl', coalesce((
          SELECT sum(profit_loss)::numeric FROM trade_history
          WHERE closed_at IS NOT NULL
        ), 0),
        'pnl_24h', coalesce((
          SELECT sum(profit_loss)::numeric FROM trade_history
          WHERE closed_at >= v_day_ago
        ), 0),
        'win_rate', coalesce((
          SELECT round(
            100.0 * count(*) FILTER (WHERE profit_loss > 0)
            / nullif(count(*), 0),
            1
          )
          FROM trade_history
          WHERE closed_at IS NOT NULL
        ), 0),
        'hl_fees_accrued_usd', coalesce((
          SELECT sum(success_fee_usd)::numeric FROM hl_fee_ledger
          WHERE status = 'accrued'
        ), 0),
        'hl_fees_settled_usd', coalesce((
          SELECT sum(success_fee_usd)::numeric FROM hl_fee_ledger
          WHERE status = 'settled'
        ), 0),
        'hl_fees_total_usd', coalesce((
          SELECT sum(success_fee_usd)::numeric FROM hl_fee_ledger
        ), 0),
        'notifications_pending_email', (
          SELECT count(*)::int FROM user_trade_notifications
          WHERE email_sent_at IS NULL
        ),
        'betting_open', (SELECT count(*)::int FROM hl_betting_positions),
        'active_subscriptions', (
          SELECT count(*)::int FROM subscriptions WHERE status = 'active'
        )
      )
    ),
    'active_bots', coalesce((
      SELECT jsonb_agg(row_to_json(b) ORDER BY b.auto_trade_enabled DESC, b.updated_at DESC)
      FROM (
        SELECT
          lower(vs.wallet_address) AS wallet_address,
          vs.user_id,
          p.email,
          vs.auto_trade_enabled,
          vs.execution_venue,
          vs.leverage_multiplier,
          vs.take_profit_percent,
          vs.stop_loss_percent,
          vs.hl_bot_strategy,
          vs.news_trade_mode,
          vs.updated_at,
          (ha.wallet_address IS NOT NULL) AS agent_approved,
          ha.approved_at AS agent_approved_at,
          ha.expires_at AS agent_expires_at
        FROM vault_settings vs
        LEFT JOIN profiles p ON p.id = vs.user_id
        LEFT JOIN hl_agent_approvals ha
          ON lower(ha.wallet_address) = lower(vs.wallet_address)
          AND ha.revoked_at IS NULL
        WHERE coalesce(vs.execution_venue, 'hyperliquid') = 'hyperliquid'
        ORDER BY vs.auto_trade_enabled DESC, vs.updated_at DESC
        LIMIT 200
      ) b
    ), '[]'::jsonb),
    'open_positions', coalesce((
      SELECT jsonb_agg(row_to_json(op) ORDER BY op.created_at DESC)
      FROM (
        SELECT
          id,
          lower(wallet_address) AS wallet_address,
          token_symbol,
          direction,
          status,
          entry_amount,
          entry_price,
          profit_loss,
          profit_loss_percent,
          leverage_multiplier,
          created_at
        FROM positions
        WHERE status IN ('open', 'closing')
        ORDER BY created_at DESC
        LIMIT 100
      ) op
    ), '[]'::jsonb),
    'recent_closes', coalesce((
      SELECT jsonb_agg(row_to_json(c) ORDER BY c.closed_at DESC)
      FROM (
        SELECT
          th.id,
          lower(th.wallet_address) AS wallet_address,
          th.token_symbol,
          th.direction,
          th.profit_loss,
          th.profit_loss_percent,
          th.close_reason,
          th.execution_venue,
          th.platform_success_fee,
          th.platform_fee_status,
          th.closed_at,
          p.email
        FROM trade_history th
        LEFT JOIN profiles p ON lower(coalesce(p.wallet_address, '')) = lower(th.wallet_address)
        WHERE th.closed_at IS NOT NULL
        ORDER BY th.closed_at DESC
        LIMIT 80
      ) c
    ), '[]'::jsonb),
    'recent_events', coalesce((
      SELECT jsonb_agg(row_to_json(e) ORDER BY e.closed_at DESC)
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
        FROM user_trade_notifications n
        LEFT JOIN profiles p ON p.id = n.user_id
        ORDER BY n.closed_at DESC
        LIMIT 60
      ) e
    ), '[]'::jsonb),
    'fee_ledger', coalesce((
      SELECT jsonb_agg(row_to_json(f) ORDER BY f.created_at DESC)
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
        FROM hl_fee_ledger
        ORDER BY created_at DESC
        LIMIT 100
      ) f
    ), '[]'::jsonb),
    'betting_positions', coalesce((
      SELECT jsonb_agg(row_to_json(bp) ORDER BY bp.updated_at DESC)
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
        FROM hl_betting_positions
        ORDER BY updated_at DESC
        LIMIT 50
      ) bp
    ), '[]'::jsonb),
    'betting_closes', coalesce((
      SELECT jsonb_agg(row_to_json(bc) ORDER BY bc.closed_at DESC)
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
        FROM hl_betting_closes
        ORDER BY closed_at DESC
        LIMIT 40
      ) bc
    ), '[]'::jsonb),
    'users', coalesce((
      SELECT jsonb_agg(row_to_json(u) ORDER BY u.created_at DESC)
      FROM (
        SELECT
          id,
          email,
          wallet_address,
          membership_tier,
          trade_close_email_enabled,
          created_at
        FROM profiles
        ORDER BY created_at DESC
        LIMIT 500
      ) u
    ), '[]'::jsonb),
    'subscriptions', coalesce((
      SELECT jsonb_agg(row_to_json(s) ORDER BY s.start_date DESC)
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
        FROM subscriptions
        ORDER BY start_date DESC
        LIMIT 200
      ) s
    ), '[]'::jsonb),
    'payments', coalesce((
      SELECT jsonb_agg(row_to_json(pay) ORDER BY pay.created_at DESC)
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
        FROM pending_payments
        ORDER BY created_at DESC
        LIMIT 200
      ) pay
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_hl_dashboard() TO authenticated;

COMMENT ON FUNCTION public.get_admin_hl_dashboard IS
  'Hyperliquid admin snapshot — stats, bots, positions, trade_history, notifications, fees, betting. Requires is_admin().';
