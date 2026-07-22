-- Admin in-app notifications (new signups, support tickets).

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('signup', 'support')),
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notifications_created_idx
  ON public.admin_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_notifications_unread_idx
  ON public.admin_notifications (created_at DESC)
  WHERE read_at IS NULL;

COMMENT ON TABLE public.admin_notifications IS
  'Ops feed for Admin Monitor: new registrations + support tickets.';

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read admin_notifications" ON public.admin_notifications;
CREATE POLICY "Admin read admin_notifications"
  ON public.admin_notifications FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin update admin_notifications" ON public.admin_notifications;
CREATE POLICY "Admin update admin_notifications"
  ON public.admin_notifications FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Inserts come from SECURITY DEFINER triggers / service role only.
GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.admin_notify_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_name text;
  v_username text;
BEGIN
  v_email := coalesce(nullif(trim(NEW.email), ''), 'unknown');
  v_name := coalesce(nullif(trim(NEW.full_name), ''), '');
  v_username := coalesce(nullif(trim(NEW.username), ''), '');

  INSERT INTO public.admin_notifications (kind, title, body, payload)
  VALUES (
    'signup',
    'New registration',
    v_email,
    jsonb_build_object(
      'user_id', NEW.id,
      'email', v_email,
      'full_name', v_name,
      'username', v_username,
      'country', coalesce(NEW.country, '')
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_new_profile ON public.profiles;
CREATE TRIGGER trg_admin_notify_new_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_notify_new_profile();

CREATE OR REPLACE FUNCTION public.admin_notify_new_support()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (kind, title, body, payload)
  VALUES (
    'support',
    coalesce(nullif(trim(NEW.subject), ''), 'Support request'),
    left(coalesce(NEW.message, ''), 240),
    jsonb_build_object(
      'ticket_id', NEW.id,
      'user_id', NEW.user_id,
      'email', coalesce(NEW.user_email, ''),
      'username', coalesce(NEW.user_username, ''),
      'wallet_address', coalesce(NEW.wallet_address, '')
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_new_support ON public.support_requests;
CREATE TRIGGER trg_admin_notify_new_support
  AFTER INSERT ON public.support_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_notify_new_support();

CREATE OR REPLACE FUNCTION public.mark_admin_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    UPDATE public.admin_notifications
    SET read_at = now()
    WHERE read_at IS NULL;
  ELSE
    UPDATE public.admin_notifications
    SET read_at = now()
    WHERE read_at IS NULL AND id = ANY (p_ids);
  END IF;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_admin_notifications_read(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_admin_notifications_read(uuid[]) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
