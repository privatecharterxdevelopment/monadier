-- Community @mentions → in-app bell (user_trade_notifications) + email queue.

ALTER TABLE public.user_trade_notifications
  ADD COLUMN IF NOT EXISTS community_post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS community_comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS community_mention_email_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.community_mention_email_enabled IS
  'When true, user receives an email when mentioned with @username in Community.';

COMMENT ON COLUMN public.user_trade_notifications.community_post_id IS
  'Community post for mention notifications (kind = community).';
COMMENT ON COLUMN public.user_trade_notifications.community_comment_id IS
  'Community comment that contained the mention, when applicable.';

-- kind: allow community
ALTER TABLE public.user_trade_notifications
  DROP CONSTRAINT IF EXISTS user_trade_notifications_kind_check;

ALTER TABLE public.user_trade_notifications
  ADD CONSTRAINT user_trade_notifications_kind_check
  CHECK (kind IN ('bot', 'manual', 'betting', 'community'));

-- event_type: allow mention
ALTER TABLE public.user_trade_notifications
  DROP CONSTRAINT IF EXISTS user_trade_notifications_event_type_check;

ALTER TABLE public.user_trade_notifications
  ADD CONSTRAINT user_trade_notifications_event_type_check
  CHECK (event_type IN ('open', 'close', 'mention'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_trade_notif_community_comment
  ON public.user_trade_notifications (user_id, community_comment_id)
  WHERE kind = 'community' AND community_comment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_trade_notif_community_post
  ON public.user_trade_notifications (user_id, community_post_id)
  WHERE kind = 'community'
    AND community_comment_id IS NULL
    AND community_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_trade_notif_community_post_id
  ON public.user_trade_notifications (community_post_id)
  WHERE community_post_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_community_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text text;
  v_post_id uuid;
  v_comment_id uuid;
  v_author_id uuid;
  v_author_handle text;
  v_handle text;
  v_mentioned_id uuid;
  v_snippet text;
BEGIN
  IF TG_TABLE_NAME = 'community_posts' THEN
    v_text := coalesce(NEW.title, '') || E'\n' || coalesce(NEW.body, '');
    v_post_id := NEW.id;
    v_comment_id := NULL;
    v_author_id := NEW.author_id;
  ELSIF TG_TABLE_NAME = 'community_comments' THEN
    v_text := coalesce(NEW.body, '');
    v_post_id := NEW.post_id;
    v_comment_id := NEW.id;
    v_author_id := NEW.author_id;
  ELSE
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(trim(p.username), ''), 'someone')
  INTO v_author_handle
  FROM public.profiles p
  WHERE p.id = v_author_id;

  v_snippet := left(regexp_replace(trim(v_text), E'\\s+', ' ', 'g'), 200);

  FOR v_handle IN
    SELECT DISTINCT lower(m[1])
    FROM regexp_matches(lower(v_text), '@([a-z0-9_]{3,20})', 'g') AS m
  LOOP
    SELECT p.id
    INTO v_mentioned_id
    FROM public.profiles p
    WHERE lower(p.username) = v_handle
    LIMIT 1;

    IF v_mentioned_id IS NULL OR v_mentioned_id = v_author_id THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.user_trade_notifications n
      WHERE n.user_id = v_mentioned_id
        AND n.kind = 'community'
        AND n.community_post_id = v_post_id
        AND n.community_comment_id IS NOT DISTINCT FROM v_comment_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.user_trade_notifications (
      user_id,
      trade_history_id,
      wallet_address,
      kind,
      headline,
      detail,
      event_type,
      profit_loss,
      profit_loss_percent,
      closed_at,
      community_post_id,
      community_comment_id
    ) VALUES (
      v_mentioned_id,
      NULL,
      '',
      'community',
      format('@%s mentioned you', v_author_handle),
      NULLIF(v_snippet, ''),
      'mention',
      0,
      NULL,
      now(),
      v_post_id,
      v_comment_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_post_mentions ON public.community_posts;
CREATE TRIGGER trg_community_post_mentions
  AFTER INSERT ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_community_mentions();

DROP TRIGGER IF EXISTS trg_community_comment_mentions ON public.community_comments;
CREATE TRIGGER trg_community_comment_mentions
  AFTER INSERT ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_community_mentions();

GRANT EXECUTE ON FUNCTION public.notify_community_mentions() TO service_role;
