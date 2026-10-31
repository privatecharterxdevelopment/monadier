-- 1 profitable close (trade_history row) = 1 notification = 1 win email.
-- Fixes: erroneous mass email_sent_at flush, burst dedup blocking real trades, missing email re-queue on UPDATE.

CREATE OR REPLACE FUNCTION public.sync_trade_history_user_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_kind text;
  v_headline text;
  v_profit numeric;
  v_existing_id uuid;
BEGIN
  IF NEW.closed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Wait for HL fill reconcile — no notification until realized PnL is known.
  IF NEW.platform_fee_status = 'pending_fill' THEN
    RETURN NEW;
  END IF;

  v_uid := resolve_user_id_for_wallet(NEW.wallet_address);
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_kind := CASE
    WHEN NEW.execution_venue = 'hyperliquid' THEN 'bot'
    ELSE 'manual'
  END;
  v_headline := trim(
    coalesce(NEW.direction, 'LONG') || ' ' || coalesce(NEW.token_symbol, '?')
  );
  v_profit := coalesce(NEW.profit_loss, 0);

  SELECT id INTO v_existing_id
  FROM public.user_trade_notifications
  WHERE trade_history_id = NEW.id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.user_trade_notifications
    SET
      headline = v_headline,
      profit_loss = v_profit,
      profit_loss_percent = NEW.profit_loss_percent,
      closed_at = NEW.closed_at,
      email_sent_at = CASE
        WHEN profit_loss IS DISTINCT FROM v_profit THEN NULL
        ELSE email_sent_at
      END
    WHERE id = v_existing_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.user_trade_notifications (
    user_id,
    trade_history_id,
    wallet_address,
    kind,
    headline,
    profit_loss,
    profit_loss_percent,
    closed_at
  )
  VALUES (
    v_uid,
    NEW.id,
    lower(NEW.wallet_address),
    v_kind,
    v_headline,
    v_profit,
    NEW.profit_loss_percent,
    NEW.closed_at
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trade_history_user_notification ON public.trade_history;
CREATE TRIGGER trg_trade_history_user_notification
  AFTER INSERT ON public.trade_history
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_trade_history_user_notification();

DROP TRIGGER IF EXISTS trg_trade_history_user_notification_update ON public.trade_history;
CREATE TRIGGER trg_trade_history_user_notification_update
  AFTER UPDATE OF profit_loss, profit_loss_percent, platform_fee_status, closed_at
  ON public.trade_history
  FOR EACH ROW
  WHEN (
    NEW.closed_at IS NOT NULL
    AND NEW.platform_fee_status IS DISTINCT FROM 'pending_fill'
    AND (
      OLD.profit_loss IS DISTINCT FROM NEW.profit_loss
      OR OLD.profit_loss_percent IS DISTINCT FROM NEW.profit_loss_percent
      OR OLD.platform_fee_status IS DISTINCT FROM NEW.platform_fee_status
    )
  )
  EXECUTE FUNCTION public.sync_trade_history_user_notification();

-- Backfill missing notification rows (finalized closes only).
INSERT INTO public.user_trade_notifications (
  user_id,
  trade_history_id,
  wallet_address,
  kind,
  headline,
  profit_loss,
  profit_loss_percent,
  closed_at
)
SELECT
  resolve_user_id_for_wallet(th.wallet_address),
  th.id,
  lower(th.wallet_address),
  CASE WHEN th.execution_venue = 'hyperliquid' THEN 'bot' ELSE 'manual' END,
  trim(coalesce(th.direction, 'LONG') || ' ' || coalesce(th.token_symbol, '?')),
  coalesce(th.profit_loss, 0),
  th.profit_loss_percent,
  th.closed_at
FROM public.trade_history th
WHERE th.closed_at IS NOT NULL
  AND th.platform_fee_status IS DISTINCT FROM 'pending_fill'
  AND resolve_user_id_for_wallet(th.wallet_address) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_trade_notifications utn
    WHERE utn.trade_history_id = th.id
  );

-- Re-queue win emails after erroneous mass mark-as-sent (20260910150000 flush).
UPDATE public.user_trade_notifications
SET email_sent_at = NULL
WHERE profit_loss > 0
  AND closed_at > NOW() - INTERVAL '14 days';
