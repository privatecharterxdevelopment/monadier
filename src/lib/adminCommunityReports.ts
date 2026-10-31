import { supabase } from './supabase';

export type CommunityReportStatus = 'open' | 'reviewed' | 'dismissed' | 'actioned';

export type CommunityReportRow = {
  id: string;
  reporter_id: string;
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  status: CommunityReportStatus;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
  post_title?: string | null;
  post_body?: string | null;
  comment_body?: string | null;
  reporter_email?: string | null;
  reporter_username?: string | null;
};

export async function fetchAdminCommunityReports(opts?: {
  status?: CommunityReportStatus | 'all';
  limit?: number;
}): Promise<{ rows: CommunityReportRow[]; error: string | null }> {
  const limit = opts?.limit ?? 50;
  let query = supabase
    .from('community_reports')
    .select(
      'id, reporter_id, post_id, comment_id, reason, status, admin_note, created_at, resolved_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts?.status && opts.status !== 'all') {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) return { rows: [], error: error.message };
  const rows = (data ?? []) as CommunityReportRow[];

  const reporterIds = [...new Set(rows.map((r) => r.reporter_id))];
  const postIds = [...new Set(rows.map((r) => r.post_id).filter(Boolean))] as string[];
  const commentIds = [...new Set(rows.map((r) => r.comment_id).filter(Boolean))] as string[];

  const [profilesRes, postsRes, commentsRes] = await Promise.all([
    reporterIds.length
      ? supabase.from('profiles').select('id, email, username').in('id', reporterIds)
      : Promise.resolve({ data: [] as { id: string; email: string | null; username: string | null }[] }),
    postIds.length
      ? supabase.from('community_posts').select('id, title, body, is_hidden').in('id', postIds)
      : Promise.resolve({ data: [] as { id: string; title: string; body: string; is_hidden: boolean }[] }),
    commentIds.length
      ? supabase.from('community_comments').select('id, body, is_hidden').in('id', commentIds)
      : Promise.resolve({ data: [] as { id: string; body: string; is_hidden: boolean }[] }),
  ]);

  const profileMap = new Map(
    (profilesRes.data ?? []).map((p) => [p.id as string, p] as const)
  );
  const postMap = new Map(
    (postsRes.data ?? []).map((p) => [p.id as string, p] as const)
  );
  const commentMap = new Map(
    (commentsRes.data ?? []).map((c) => [c.id as string, c] as const)
  );

  return {
    rows: rows.map((r) => {
      const profile = profileMap.get(r.reporter_id);
      const post = r.post_id ? postMap.get(r.post_id) : undefined;
      const comment = r.comment_id ? commentMap.get(r.comment_id) : undefined;
      return {
        ...r,
        reporter_email: profile?.email ?? null,
        reporter_username: profile?.username ?? null,
        post_title: post?.title ?? null,
        post_body: post?.body ?? null,
        comment_body: comment?.body ?? null,
      };
    }),
    error: null,
  };
}

export async function updateCommunityReportStatus(
  reportId: string,
  status: CommunityReportStatus,
  adminNote?: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('community_reports')
    .update({
      status,
      admin_note: adminNote ?? null,
      resolved_at: status === 'open' ? null : new Date().toISOString(),
    })
    .eq('id', reportId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function hideCommunityPost(
  postId: string,
  hidden = true
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('community_posts')
    .update({ is_hidden: hidden, updated_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function hideCommunityComment(
  commentId: string,
  hidden = true
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('community_comments')
    .update({ is_hidden: hidden })
    .eq('id', commentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
