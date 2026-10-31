-- Live support chat: threaded messages on support_requests + realtime.

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'form';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_requests_channel_check'
  ) THEN
    ALTER TABLE public.support_requests
      ADD CONSTRAINT support_requests_channel_check
      CHECK (channel IN ('form', 'chat'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.support_requests (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('user', 'admin')),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_request_created
  ON public.support_messages (request_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_support_messages_created
  ON public.support_messages (created_at DESC);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_messages_select_participants ON public.support_messages;
CREATE POLICY support_messages_select_participants
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.support_requests r
      WHERE r.id = request_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS support_messages_insert_user ON public.support_messages;
CREATE POLICY support_messages_insert_user
  ON public.support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = 'user'
    AND EXISTS (
      SELECT 1
      FROM public.support_requests r
      WHERE r.id = request_id
        AND r.user_id = auth.uid()
        AND r.status = 'open'
    )
  );

DROP POLICY IF EXISTS support_messages_insert_admin ON public.support_messages;
CREATE POLICY support_messages_insert_admin
  ON public.support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    AND sender_id = auth.uid()
    AND sender_role = 'admin'
  );

-- Seed first message from legacy single-message tickets (before notify trigger).
INSERT INTO public.support_messages (request_id, sender_id, sender_role, body, created_at)
SELECT r.id, r.user_id, 'user', r.message, r.created_at
FROM public.support_requests r
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_messages sm WHERE sm.request_id = r.id
);

COMMENT ON TABLE public.support_messages IS
  'Threaded live support chat messages between users and admins.';

-- Notify admins when a user sends a follow-up chat message (not the first).
CREATE OR REPLACE FUNCTION public.admin_notify_support_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.support_requests%ROWTYPE;
  preview text;
  msg_count integer;
BEGIN
  IF NEW.sender_role <> 'user' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO req FROM public.support_requests WHERE id = NEW.request_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int INTO msg_count
  FROM public.support_messages
  WHERE request_id = NEW.request_id;

  -- Skip the first message — ticket INSERT already notifies via kind=support.
  IF msg_count <= 1 THEN
    RETURN NEW;
  END IF;

  preview := left(trim(NEW.body), 120);

  INSERT INTO public.admin_notifications (kind, title, body, payload)
  VALUES (
    'support',
    'Support chat: ' || coalesce(nullif(trim(req.subject), ''), 'Live chat'),
    preview,
    jsonb_build_object(
      'ticket_id', req.id,
      'message_id', NEW.id,
      'user_id', req.user_id,
      'email', coalesce(req.user_email, ''),
      'username', coalesce(req.user_username, ''),
      'wallet_address', coalesce(req.wallet_address, '')
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_support_message ON public.support_messages;
CREATE TRIGGER trg_admin_notify_support_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_notify_support_message();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
