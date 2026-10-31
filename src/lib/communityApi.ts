import { supabase } from './supabase';
import {
  COMMUNITY_CATEGORIES,
  moderateCommunityText,
  type CommunityCategory,
} from './communityModeration';

export type CommunityPost = {
  id: string;
  author_id: string;
  category: CommunityCategory;
  title: string;
  body: string;
  view_count: number;
  comment_count: number;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  author_username?: string | null;
  author_full_name?: string | null;
};

export type CommunityComment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  is_hidden: boolean;
  created_at: string;
  author_username?: string | null;
  author_full_name?: string | null;
};

export { COMMUNITY_CATEGORIES };
export type { CommunityCategory };

function authorLabel(row: {
  author_username?: string | null;
  author_full_name?: string | null;
  author_id: string;
}): string {
  return (
    row.author_username?.trim() ||
    row.author_full_name?.trim() ||
    `${row.author_id.slice(0, 6)}…`
  );
}

export { authorLabel };

async function attachAuthors<T extends { author_id: string }>(
  rows: T[]
): Promise<Array<T & { author_username: string | null; author_full_name: string | null }>> {
  const ids = [...new Set(rows.map((r) => r.author_id))];
  if (!ids.length) return rows.map((r) => ({ ...r, author_username: null, author_full_name: null }));
  const { data } = await supabase
    .from('community_public_authors')
    .select('id, username, full_name')
    .in('id', ids);
  const map = new Map(
    (data ?? []).map((p) => [p.id as string, p] as const)
  );
  return rows.map((r) => {
    const p = map.get(r.author_id);
    return {
      ...r,
      author_username: p?.username ?? null,
      author_full_name: p?.full_name ?? null,
    };
  });
}

export async function fetchCommunityPosts(opts: {
  category?: CommunityCategory | 'all';
  query?: string;
  authorId?: string;
  limit?: number;
}): Promise<{ posts: CommunityPost[]; error: string | null }> {
  let q = supabase
    .from('community_posts')
    .select(
      'id, author_id, category, title, body, view_count, comment_count, is_hidden, created_at, updated_at'
    )
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50);

  // Authors viewing their own feed include hidden posts; public feed does not.
  if (!opts.authorId) {
    q = q.eq('is_hidden', false);
  }
  if (opts.category && opts.category !== 'all') {
    q = q.eq('category', opts.category);
  }
  if (opts.authorId) {
    q = q.eq('author_id', opts.authorId);
  }
  const needle = opts.query?.trim().replace(/[%_,.()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (needle) {
    q = q.or(`title.ilike.%${needle}%,body.ilike.%${needle}%`);
  }

  const { data, error } = await q;
  if (error) return { posts: [], error: error.message };
  const withAuthors = await attachAuthors((data ?? []) as CommunityPost[]);
  return { posts: withAuthors as CommunityPost[], error: null };
}

export async function fetchCommunityPost(
  postId: string
): Promise<{ post: CommunityPost | null; error: string | null }> {
  const { data, error } = await supabase
    .from('community_posts')
    .select(
      'id, author_id, category, title, body, view_count, comment_count, is_hidden, created_at, updated_at'
    )
    .eq('id', postId)
    .maybeSingle();
  if (error) return { post: null, error: error.message };
  if (!data) return { post: null, error: null };
  const [withAuthor] = await attachAuthors([data as CommunityPost]);
  return { post: withAuthor as CommunityPost, error: null };
}

export async function createCommunityPost(input: {
  title: string;
  body: string;
  category: CommunityCategory;
  authorId: string;
}): Promise<{ post: CommunityPost | null; error: string | null }> {
  const titleMod = moderateCommunityText(input.title, { field: 'title' });
  if (!titleMod.ok) return { post: null, error: titleMod.error };
  const bodyMod = moderateCommunityText(input.body, { field: 'body' });
  if (!bodyMod.ok) return { post: null, error: bodyMod.error };
  if (!COMMUNITY_CATEGORIES.includes(input.category)) {
    return { post: null, error: 'Invalid category' };
  }

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      author_id: input.authorId,
      title: input.title.trim(),
      body: input.body.trim(),
      category: input.category,
    })
    .select(
      'id, author_id, category, title, body, view_count, comment_count, is_hidden, created_at, updated_at'
    )
    .single();
  if (error) return { post: null, error: error.message };
  return { post: data as CommunityPost, error: null };
}

export async function deleteCommunityPost(postId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('community_posts').delete().eq('id', postId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchCommunityComments(
  postId: string
): Promise<{ comments: CommunityComment[]; error: string | null }> {
  const { data, error } = await supabase
    .from('community_comments')
    .select('id, post_id, author_id, body, is_hidden, created_at')
    .eq('post_id', postId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) return { comments: [], error: error.message };
  const withAuthors = await attachAuthors((data ?? []) as CommunityComment[]);
  return { comments: withAuthors as CommunityComment[], error: null };
}

export async function createCommunityComment(input: {
  postId: string;
  body: string;
  authorId: string;
}): Promise<{ comment: CommunityComment | null; error: string | null }> {
  const mod = moderateCommunityText(input.body, { field: 'comment' });
  if (!mod.ok) return { comment: null, error: mod.error };

  const { data, error } = await supabase
    .from('community_comments')
    .insert({
      post_id: input.postId,
      author_id: input.authorId,
      body: input.body.trim(),
    })
    .select('id, post_id, author_id, body, is_hidden, created_at')
    .single();
  if (error) return { comment: null, error: error.message };
  return { comment: data as CommunityComment, error: null };
}

export async function recordCommunityPostView(postId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('community_record_post_view', {
    p_post_id: postId,
  });
  if (error) return null;
  return typeof data === 'number' ? data : Number(data) || null;
}

export async function reportCommunityContent(input: {
  reporterId: string;
  postId?: string;
  commentId?: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    return { ok: false, error: 'Reason must be 3–500 characters.' };
  }
  const { error } = await supabase.from('community_reports').insert({
    reporter_id: input.reporterId,
    post_id: input.postId ?? null,
    comment_id: input.commentId ?? null,
    reason,
  });
  if (error) {
    if (error.message.includes('duplicate') || error.code === '23505') {
      return { ok: false, error: 'You already reported this.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function fetchMyCommunityStats(authorId: string): Promise<{
  posts: CommunityPost[];
  totalViews: number;
  totalComments: number;
  error: string | null;
}> {
  const { posts, error } = await fetchCommunityPosts({ authorId, limit: 100 });
  if (error) return { posts: [], totalViews: 0, totalComments: 0, error };
  const totalViews = posts.reduce((s, p) => s + (p.view_count || 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comment_count || 0), 0);
  return { posts, totalViews, totalComments, error: null };
}

export type MyCommunityComment = CommunityComment & {
  post_title?: string | null;
};

export async function fetchMyCommunityComments(
  authorId: string
): Promise<{ comments: MyCommunityComment[]; error: string | null }> {
  const { data, error } = await supabase
    .from('community_comments')
    .select('id, post_id, author_id, body, is_hidden, created_at, community_posts(title)')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return { comments: [], error: error.message };

  const comments: MyCommunityComment[] = (data ?? []).map((row) => {
    const postJoin = (row as { community_posts?: { title?: string } | { title?: string }[] | null })
      .community_posts;
    const post = Array.isArray(postJoin) ? postJoin[0] : postJoin;
    return {
      id: row.id as string,
      post_id: row.post_id as string,
      author_id: row.author_id as string,
      body: row.body as string,
      is_hidden: Boolean(row.is_hidden),
      created_at: row.created_at as string,
      post_title: post?.title ?? null,
    };
  });

  return { comments, error: null };
}
