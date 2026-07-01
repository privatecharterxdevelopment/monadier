-- Admin fee win count: use hl_fee_ledger (same as bot-service), not stale wallet_platform_fee_state cache.

-- Re-sync cache table from ledger (email timestamps preserved).
UPDATE public.wallet_platform_fee_state s
SET
  success_win_count = sub.cnt,
  updated_at = now()
FROM (
  SELECT
    lower(wallet_address) AS w,
    count(*)::int AS cnt
  FROM public.hl_fee_ledger
  WHERE fee_source = 'bot'
    AND status = 'accrued'
    AND coalesce(success_fee_usd, 0) > 0
  GROUP BY lower(wallet_address)
) sub
WHERE lower(s.wallet_address) = sub.w;

INSERT INTO public.wallet_platform_fee_state (wallet_address, success_win_count, updated_at)
SELECT lower(wallet_address), count(*)::int, now()
FROM public.hl_fee_ledger
WHERE fee_source = 'bot'
  AND status = 'accrued'
  AND coalesce(success_fee_usd, 0) > 0
GROUP BY lower(wallet_address)
ON CONFLICT (wallet_address) DO UPDATE
SET success_win_count = EXCLUDED.success_win_count, updated_at = now();

CREATE OR REPLACE VIEW public.wallet_unpaid_bot_fee_wins AS
SELECT
  lower(wallet_address) AS wallet_address,
  count(*)::int AS unpaid_bot_win_count
FROM public.hl_fee_ledger
WHERE fee_source = 'bot'
  AND status = 'accrued'
  AND coalesce(success_fee_usd, 0) > 0
GROUP BY 1;

COMMENT ON VIEW public.wallet_unpaid_bot_fee_wins IS
  'Unpaid profitable bot closes with platform fee — source of truth for opens-blocked gate.';

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
  v_hl_chain_id int := 42161;
  v_fee_win_block int := 20;
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
        'hl_bots_toggle_on', (
          SELECT count(*)::int FROM public.vault_settings
          WHERE auto_trade_enabled = true
            AND coalesce(execution_venue, 'hyperliquid') = 'hyperliquid'
        ),
        'hl_bots_runnable', (
          SELECT count(*)::int
          FROM public.vault_settings vs
          LEFT JOIN public.hl_agent_approvals ha
            ON lower(ha.wallet_address) = lower(vs.wallet_address)
            AND ha.revoked_at IS NULL
          LEFT JOIN (
            SELECT
              lower(wallet_address) AS w,
              coalesce(sum(coalesce(accrued_fee_usd, success_fee_usd, 0))
                FILTER (WHERE status = 'accrued'), 0) AS fees_accrued_usd
            FROM public.hl_fee_ledger
            GROUP BY 1
          ) fee ON fee.w = lower(vs.wallet_address)
                  LEFT JOIN (
          SELECT
            lower(wallet_address) AS w,
            count(*)::int AS unpaid_bot_win_count
          FROM public.hl_fee_ledger
          WHERE fee_source = 'bot'
            AND status = 'accrued'
            AND coalesce(success_fee_usd, 0) > 0
          GROUP BY 1
        ) bot_wins ON bot_wins.w = lower(vs.wallet_address)
          WHERE coalesce(vs.execution_venue, 'hyperliquid') = 'hyperliquid'
            AND vs.auto_trade_enabled = true
            AND vs.chain_id = v_hl_chain_id
            AND vs.execution_venue = 'hyperliquid'
            AND ha.wallet_address IS NOT NULL
            AND NOT (
              coalesce(fee.fees_accrued_usd, 0) > 0.000001
              AND coalesce(bot_wins.unpaid_bot_win_count, 0) >= v_fee_win_block
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.platform_fee_waivers w
              WHERE lower(w.wallet_address) = lower(vs.wallet_address)
            )
        ),
        'hl_bots_active', (
          SELECT count(*)::int
          FROM public.vault_settings vs
          LEFT JOIN public.hl_agent_approvals ha
            ON lower(ha.wallet_address) = lower(vs.wallet_address)
            AND ha.revoked_at IS NULL
          LEFT JOIN (
            SELECT
              lower(wallet_address) AS w,
              coalesce(sum(coalesce(accrued_fee_usd, success_fee_usd, 0))
                FILTER (WHERE status = 'accrued'), 0) AS fees_accrued_usd
            FROM public.hl_fee_ledger
            GROUP BY 1
          ) fee ON fee.w = lower(vs.wallet_address)
                  LEFT JOIN (
          SELECT
            lower(wallet_address) AS w,
            count(*)::int AS unpaid_bot_win_count
          FROM public.hl_fee_ledger
          WHERE fee_source = 'bot'
            AND status = 'accrued'
            AND coalesce(success_fee_usd, 0) > 0
          GROUP BY 1
        ) bot_wins ON bot_wins.w = lower(vs.wallet_address)
          WHERE coalesce(vs.execution_venue, 'hyperliquid') = 'hyperliquid'
            AND vs.auto_trade_enabled = true
            AND vs.chain_id = v_hl_chain_id
            AND vs.execution_venue = 'hyperliquid'
            AND ha.wallet_address IS NOT NULL
            AND NOT (
              coalesce(fee.fees_accrued_usd, 0) > 0.000001
              AND coalesce(bot_wins.unpaid_bot_win_count, 0) >= v_fee_win_block
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.platform_fee_waivers w
              WHERE lower(w.wallet_address) = lower(vs.wallet_address)
            )
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
        'platform_fees_paid_usd', coalesce((
          SELECT sum(amount_usd)::numeric FROM public.platform_fee_payments
        ), 0),
        'platform_fees_owed_usd', coalesce((
          SELECT sum(coalesce(accrued_fee_usd, success_fee_usd, 0))::numeric
          FROM public.hl_fee_ledger
          WHERE status = 'accrued'
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
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.bot_runnable DESC, b.auto_trade_enabled DESC, b.updated_at DESC)
      FROM (
        SELECT
          lower(vs.wallet_address) AS wallet_address,
          vs.user_id,
          vs.chain_id,
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
          ha.expires_at AS agent_expires_at,
          coalesce(fee.fees_accrued_usd, 0) AS fees_accrued_usd,
          coalesce(fee.fees_settled_usd, 0) AS fees_settled_usd,
          coalesce(pay.fees_paid_usd, 0) AS fees_paid_usd,
          greatest(
            0,
            coalesce(fee.fees_accrued_usd, 0) - coalesce(pay.fees_paid_usd, 0)
          ) AS fees_owed_usd,
          coalesce(bot_wins.unpaid_bot_win_count, 0)::int AS fee_win_count,
          (
            coalesce(fee.fees_accrued_usd, 0) > 0.000001
            AND coalesce(bot_wins.unpaid_bot_win_count, 0) >= v_fee_win_block
          ) AS fee_opens_blocked,
          (
            vs.auto_trade_enabled
            AND vs.chain_id = v_hl_chain_id
            AND vs.execution_venue = 'hyperliquid'
            AND ha.wallet_address IS NOT NULL
            AND NOT (
              coalesce(fee.fees_accrued_usd, 0) > 0.000001
              AND coalesce(bot_wins.unpaid_bot_win_count, 0) >= v_fee_win_block
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.platform_fee_waivers w
              WHERE lower(w.wallet_address) = lower(vs.wallet_address)
            )
          ) AS bot_runnable,
          trim(both ' · ' FROM concat_ws(
            ' · ',
            CASE WHEN NOT vs.auto_trade_enabled THEN 'toggle off' END,
            CASE WHEN vs.chain_id IS DISTINCT FROM v_hl_chain_id THEN 'chain ' || vs.chain_id::text END,
            CASE WHEN vs.execution_venue IS NULL THEN 'venue null' END,
            CASE
              WHEN vs.execution_venue IS NOT NULL AND vs.execution_venue <> 'hyperliquid'
                THEN 'venue ' || vs.execution_venue
            END,
            CASE WHEN ha.wallet_address IS NULL THEN 'no agent' END,
            CASE
              WHEN coalesce(fee.fees_accrued_usd, 0) > 0.000001
                AND coalesce(bot_wins.unpaid_bot_win_count, 0) >= v_fee_win_block
                THEN 'fees due (' || coalesce(bot_wins.unpaid_bot_win_count, 0)::text || '/20 wins)'
            END,
            CASE
              WHEN EXISTS (
                SELECT 1 FROM public.platform_fee_waivers w
                WHERE lower(w.wallet_address) = lower(vs.wallet_address)
              ) THEN 'fee waived'
            END
          )) AS blockers
        FROM public.vault_settings vs
        LEFT JOIN public.profiles p ON p.id = vs.user_id
        LEFT JOIN public.hl_agent_approvals ha
          ON lower(ha.wallet_address) = lower(vs.wallet_address)
          AND ha.revoked_at IS NULL
        LEFT JOIN (
          SELECT
            lower(wallet_address) AS w,
            coalesce(sum(coalesce(accrued_fee_usd, success_fee_usd, 0))
              FILTER (WHERE status = 'accrued'), 0) AS fees_accrued_usd,
            coalesce(sum(success_fee_usd) FILTER (WHERE status = 'settled'), 0) AS fees_settled_usd
          FROM public.hl_fee_ledger
          GROUP BY 1
        ) fee ON fee.w = lower(vs.wallet_address)
        LEFT JOIN (
          SELECT lower(wallet_address) AS w, sum(amount_usd) AS fees_paid_usd
          FROM public.platform_fee_payments
          GROUP BY 1
        ) pay ON pay.w = lower(vs.wallet_address)
                LEFT JOIN (
          SELECT
            lower(wallet_address) AS w,
            count(*)::int AS unpaid_bot_win_count
          FROM public.hl_fee_ledger
          WHERE fee_source = 'bot'
            AND status = 'accrued'
            AND coalesce(success_fee_usd, 0) > 0
          GROUP BY 1
        ) bot_wins ON bot_wins.w = lower(vs.wallet_address)
        WHERE coalesce(vs.execution_venue, 'hyperliquid') = 'hyperliquid'
        LIMIT 200
      ) b
    ), '[]'::jsonb),
    'wallet_fees', coalesce((
      SELECT jsonb_agg(to_jsonb(wf) ORDER BY wf.fees_owed_usd DESC, wf.fees_accrued_usd DESC)
      FROM (
        SELECT
          lower(vs.wallet_address) AS wallet_address,
          p.email,
          vs.auto_trade_enabled,
          coalesce(fee.fees_accrued_usd, 0) AS fees_accrued_usd,
          coalesce(fee.fees_settled_usd, 0) AS fees_settled_usd,
          coalesce(pay.fees_paid_usd, 0) AS fees_paid_usd,
          greatest(
            0,
            coalesce(fee.fees_accrued_usd, 0) - coalesce(pay.fees_paid_usd, 0)
          ) AS fees_owed_usd,
          coalesce(bot_wins.unpaid_bot_win_count, 0)::int AS fee_win_count,
          greatest(0, v_fee_win_block - coalesce(bot_wins.unpaid_bot_win_count, 0))::int AS wins_until_fee,
          (
            coalesce(fee.fees_accrued_usd, 0) > 0.000001
            AND coalesce(bot_wins.unpaid_bot_win_count, 0) >= v_fee_win_block
          ) AS fee_opens_blocked,
          CASE
            WHEN coalesce(pay.fees_paid_usd, 0) > 0
              AND coalesce(fee.fees_accrued_usd, 0) <= coalesce(pay.fees_paid_usd, 0)
              THEN 'paid'
            WHEN coalesce(fee.fees_accrued_usd, 0) > 0.000001 THEN 'owed'
            ELSE 'clear'
          END AS fee_payment_status
        FROM public.vault_settings vs
        LEFT JOIN public.profiles p ON p.id = vs.user_id
        LEFT JOIN (
          SELECT
            lower(wallet_address) AS w,
            coalesce(sum(coalesce(accrued_fee_usd, success_fee_usd, 0))
              FILTER (WHERE status = 'accrued'), 0) AS fees_accrued_usd,
            coalesce(sum(success_fee_usd) FILTER (WHERE status = 'settled'), 0) AS fees_settled_usd
          FROM public.hl_fee_ledger
          GROUP BY 1
        ) fee ON fee.w = lower(vs.wallet_address)
        LEFT JOIN (
          SELECT lower(wallet_address) AS w, sum(amount_usd) AS fees_paid_usd
          FROM public.platform_fee_payments
          GROUP BY 1
        ) pay ON pay.w = lower(vs.wallet_address)
                LEFT JOIN (
          SELECT
            lower(wallet_address) AS w,
            count(*)::int AS unpaid_bot_win_count
          FROM public.hl_fee_ledger
          WHERE fee_source = 'bot'
            AND status = 'accrued'
            AND coalesce(success_fee_usd, 0) > 0
          GROUP BY 1
        ) bot_wins ON bot_wins.w = lower(vs.wallet_address)
        WHERE coalesce(vs.execution_venue, 'hyperliquid') = 'hyperliquid'
          AND (
            coalesce(fee.fees_accrued_usd, 0) > 0
            OR coalesce(pay.fees_paid_usd, 0) > 0
            OR vs.auto_trade_enabled
          )
      ) wf
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
          coalesce(
            nullif(trim(p.wallet_address), ''),
            (
              SELECT lower(vs.wallet_address)
              FROM public.vault_settings vs
              WHERE vs.user_id = p.id
                AND coalesce(vs.execution_venue, 'hyperliquid') = 'hyperliquid'
              ORDER BY vs.auto_trade_enabled DESC, vs.updated_at DESC
              LIMIT 1
            )
          ) AS wallet_address,
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
          coalesce(bot_wins.unpaid_bot_win_count, 0)::int AS fee_win_count,
          greatest(0, v_fee_win_block - coalesce(bot_wins.unpaid_bot_win_count, 0))::int AS wins_until_fee
        FROM public.profiles p
        LEFT JOIN LATERAL (
          SELECT lower(vs.wallet_address) AS w
          FROM public.vault_settings vs
          WHERE vs.user_id = p.id
            AND coalesce(vs.execution_venue, 'hyperliquid') = 'hyperliquid'
          ORDER BY vs.auto_trade_enabled DESC, vs.updated_at DESC
          LIMIT 1
        ) vw ON true
        LEFT JOIN (
          SELECT
            lower(wallet_address) AS w,
            sum(profit_loss) AS closed_pnl,
            count(*)::int AS closed_count
          FROM public.trade_history
          WHERE closed_at IS NOT NULL
            AND (execution_venue IS NULL OR execution_venue = 'hyperliquid')
          GROUP BY 1
        ) th ON th.w = lower(coalesce(nullif(trim(p.wallet_address), ''), vw.w))
        LEFT JOIN (
          SELECT lower(wallet_address) AS w, count(*)::int AS open_count
          FROM public.positions
          WHERE status IN ('open', 'closing')
          GROUP BY 1
        ) op ON op.w = lower(coalesce(nullif(trim(p.wallet_address), ''), vw.w))
        LEFT JOIN (
          SELECT
            lower(wallet_address) AS w,
            coalesce(sum(coalesce(accrued_fee_usd, success_fee_usd, 0))
              FILTER (WHERE status = 'accrued'), 0) AS fees_accrued_usd,
            coalesce(sum(success_fee_usd) FILTER (WHERE status = 'settled'), 0) AS fees_settled_usd
          FROM public.hl_fee_ledger
          GROUP BY 1
        ) fee ON fee.w = lower(coalesce(nullif(trim(p.wallet_address), ''), vw.w))
        LEFT JOIN (
          SELECT lower(wallet_address) AS w, sum(amount_usd) AS fees_paid_usd
          FROM public.platform_fee_payments
          GROUP BY 1
        ) pay ON pay.w = lower(coalesce(nullif(trim(p.wallet_address), ''), vw.w))
                LEFT JOIN (
          SELECT
            lower(wallet_address) AS w,
            count(*)::int AS unpaid_bot_win_count
          FROM public.hl_fee_ledger
          WHERE fee_source = 'bot'
            AND status = 'accrued'
            AND coalesce(success_fee_usd, 0) > 0
          GROUP BY 1
        ) bot_wins ON bot_wins.w = lower(coalesce(nullif(trim(p.wallet_address), ''), vw.w))
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

GRANT EXECUTE ON FUNCTION public.get_admin_hl_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_hl_dashboard() TO service_role;

COMMENT ON FUNCTION public.get_admin_hl_dashboard IS
  'Admin HL dashboard — runnable bots match Railway (chain 42161), wallet fee owed/paid, blockers.';
