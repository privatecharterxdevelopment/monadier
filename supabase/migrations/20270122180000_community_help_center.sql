-- Community / Help Center: posts, comments, views, reports.
-- Text-only + comments. No DMs. Strict content rules enforced in app + DB checks.

CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN (
      'bot_settings',
      'referrals',
      'crypto_bots',
      'betting',
      'help',
      'general'
    )),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 120),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 10 AND 8000),
  view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  comment_count integer NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_posts_created_idx
  ON public.community_posts (created_at DESC)
  WHERE NOT is_hidden;

CREATE INDEX IF NOT EXISTS community_posts_category_idx
  ON public.community_posts (category, created_at DESC)
  WHERE NOT is_hidden;

CREATE INDEX IF NOT EXISTS community_posts_author_idx
  ON public.community_posts (author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_posts_search_idx
  ON public.community_posts
  USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '')));

CREATE TABLE IF NOT EXISTS public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_comments_post_idx
  ON public.community_comments (post_id, created_at ASC)
  WHERE NOT is_hidden;

CREATE TABLE IF NOT EXISTS public.community_post_views (
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.community_posts (id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.community_comments (id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL)
    OR (post_id IS NULL AND comment_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS community_reports_status_idx
  ON public.community_reports (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS community_reports_unique_post
  ON public.community_reports (reporter_id, post_id)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS community_reports_unique_comment
  ON public.community_reports (reporter_id, comment_id)
  WHERE comment_id IS NOT NULL;

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

-- Posts: everyone can read non-hidden; authors see own hidden; admin all
DROP POLICY IF EXISTS "community_posts_select" ON public.community_posts;
CREATE POLICY "community_posts_select"
  ON public.community_posts FOR SELECT
  USING (
    NOT is_hidden
    OR author_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "community_posts_insert" ON public.community_posts;
CREATE POLICY "community_posts_insert"
  ON public.community_posts FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "community_posts_update_own" ON public.community_posts;
CREATE POLICY "community_posts_update_own"
  ON public.community_posts FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() OR public.is_admin())
  WITH CHECK (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "community_posts_delete_own" ON public.community_posts;
CREATE POLICY "community_posts_delete_own"
  ON public.community_posts FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "community_comments_select" ON public.community_comments;
CREATE POLICY "community_comments_select"
  ON public.community_comments FOR SELECT
  USING (
    NOT is_hidden
    OR author_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "community_comments_insert" ON public.community_comments;
CREATE POLICY "community_comments_insert"
  ON public.community_comments FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "community_comments_delete" ON public.community_comments;
CREATE POLICY "community_comments_delete"
  ON public.community_comments FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "community_views_insert" ON public.community_post_views;
CREATE POLICY "community_views_insert"
  ON public.community_post_views FOR INSERT
  TO authenticated
  WITH CHECK (viewer_id = auth.uid());

DROP POLICY IF EXISTS "community_views_select_own" ON public.community_post_views;
CREATE POLICY "community_views_select_own"
  ON public.community_post_views FOR SELECT
  TO authenticated
  USING (
    viewer_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND p.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "community_reports_insert" ON public.community_reports;
CREATE POLICY "community_reports_insert"
  ON public.community_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "community_reports_select" ON public.community_reports;
CREATE POLICY "community_reports_select"
  ON public.community_reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "community_reports_admin_update" ON public.community_reports;
CREATE POLICY "community_reports_admin_update"
  ON public.community_reports FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.community_posts TO anon;
GRANT SELECT ON public.community_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_comments TO authenticated;
GRANT SELECT, INSERT ON public.community_post_views TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.community_reports TO authenticated;
GRANT ALL ON public.community_posts TO service_role;
GRANT ALL ON public.community_comments TO service_role;
GRANT ALL ON public.community_post_views TO service_role;
GRANT ALL ON public.community_reports TO service_role;

-- Keep comment_count in sync
CREATE OR REPLACE FUNCTION public.community_bump_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT NEW.is_hidden THEN
    UPDATE public.community_posts
    SET comment_count = comment_count + 1, updated_at = now()
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' AND NOT OLD.is_hidden THEN
    UPDATE public.community_posts
    SET comment_count = greatest(0, comment_count - 1), updated_at = now()
    WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_community_comment_count ON public.community_comments;
CREATE TRIGGER trg_community_comment_count
  AFTER INSERT OR DELETE ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.community_bump_comment_count();

-- Unique view increments post.view_count once per user
CREATE OR REPLACE FUNCTION public.community_record_post_view(p_post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer := 0;
  v_count integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.community_post_views (post_id, viewer_id)
  VALUES (p_post_id, uid)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    UPDATE public.community_posts
    SET view_count = view_count + 1
    WHERE id = p_post_id
    RETURNING view_count INTO v_count;
  ELSE
    SELECT view_count INTO v_count FROM public.community_posts WHERE id = p_post_id;
  END IF;

  RETURN coalesce(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.community_record_post_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_record_post_view(uuid) TO authenticated;

-- Notify admin feed on report
CREATE OR REPLACE FUNCTION public.community_notify_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (kind, title, body, payload)
  VALUES (
    'support',
    'Community report',
    left(NEW.reason, 200),
    jsonb_build_object(
      'report_id', NEW.id,
      'post_id', NEW.post_id,
      'comment_id', NEW.comment_id,
      'reporter_id', NEW.reporter_id
    )
  );
  RETURN NEW;
EXCEPTION
  WHEN undefined_table THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_notify_report ON public.community_reports;
CREATE TRIGGER trg_community_notify_report
  AFTER INSERT ON public.community_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.community_notify_report();

-- Public author handles for community (no email / secrets)
CREATE OR REPLACE VIEW public.community_public_authors
WITH (security_invoker = false) AS
SELECT
  id,
  username,
  NULLIF(trim(full_name), '') AS full_name
FROM public.profiles;

GRANT SELECT ON public.community_public_authors TO anon, authenticated;
