-- Public leaderboard: recent closes including losses (for landing live feed).
CREATE OR REPLACE FUNCTION public.get_public_bot_leaderboard(
  p_sort text DEFAULT 'top',
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  wallet_address text,
  wallet_label text,
  token_symbol text,
  direction text,
  profit_usd numeric,
  opened_at timestamptz,
  closed_at timestamptz,
  exit_tx_hash text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sort_key text := lower(coalesce(p_sort, 'top'));
BEGIN
  IF sort_key = 'recent' OR sort_key = 'recent_all' THEN
    RETURN QUERY
    SELECT
      th.id,
      lower(trim(th.wallet_address)) AS wallet_address,
      CASE
        WHEN length(trim(th.wallet_address)) >= 10 THEN
          lower(substr(trim(th.wallet_address), 3, 4)) || '…' || lower(right(trim(th.wallet_address), 4))
        ELSE lower(trim(th.wallet_address))
      END AS wallet_label,
      th.token_symbol,
      coalesce(th.direction, 'LONG') AS direction,
      th.profit_loss::numeric AS profit_usd,
      coalesce(
        th.opened_at,
        (
          SELECT m.event_ts
          FROM public.hl_bot_chart_markers m
          WHERE lower(m.wallet_address) = lower(th.wallet_address)
            AND upper(m.coin) = upper(th.token_symbol)
            AND m.event_type = 'open'
            AND m.event_ts <= coalesce(th.closed_at, th.created_at)
          ORDER BY m.event_ts DESC
          LIMIT 1
        )
      ) AS opened_at,
      th.closed_at,
      nullif(trim(th.exit_tx_hash), '') AS exit_tx_hash
    FROM public.trade_history th
    WHERE th.closed_at IS NOT NULL
      AND th.profit_loss IS NOT NULL
      AND (
        sort_key = 'recent_all'
        OR coalesce(th.profit_loss, 0) > 0
      )
      AND (
        th.execution_venue IS NULL
        OR th.execution_venue = 'hyperliquid'
      )
    ORDER BY th.closed_at DESC NULLS LAST
    LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
  ELSE
    RETURN QUERY
    SELECT
      th.id,
      lower(trim(th.wallet_address)) AS wallet_address,
      CASE
        WHEN length(trim(th.wallet_address)) >= 10 THEN
          lower(substr(trim(th.wallet_address), 3, 4)) || '…' || lower(right(trim(th.wallet_address), 4))
        ELSE lower(trim(th.wallet_address))
      END AS wallet_label,
      th.token_symbol,
      coalesce(th.direction, 'LONG') AS direction,
      th.profit_loss::numeric AS profit_usd,
      coalesce(
        th.opened_at,
        (
          SELECT m.event_ts
          FROM public.hl_bot_chart_markers m
          WHERE lower(m.wallet_address) = lower(th.wallet_address)
            AND upper(m.coin) = upper(th.token_symbol)
            AND m.event_type = 'open'
            AND m.event_ts <= coalesce(th.closed_at, th.created_at)
          ORDER BY m.event_ts DESC
          LIMIT 1
        )
      ) AS opened_at,
      th.closed_at,
      nullif(trim(th.exit_tx_hash), '') AS exit_tx_hash
    FROM public.trade_history th
    WHERE th.closed_at IS NOT NULL
      AND coalesce(th.profit_loss, 0) > 0
      AND (
        th.execution_venue IS NULL
        OR th.execution_venue = 'hyperliquid'
      )
    ORDER BY th.profit_loss DESC NULLS LAST
    LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_public_bot_leaderboard IS
  'Public HL bot closes — top wins, recent wins, or recent_all (wins+losses). Masked wallets only.';
