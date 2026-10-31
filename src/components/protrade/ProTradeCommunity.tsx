import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Eye,
  Flag,
  Gift,
  HelpCircle,
  LayoutGrid,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Plus,
  Search,
  Ticket,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  authorLabel,
  createCommunityComment,
  createCommunityPost,
  deleteCommunityPost,
  fetchCommunityComments,
  fetchCommunityPost,
  fetchCommunityPosts,
  recordCommunityPostView,
  reportCommunityContent,
  type CommunityComment,
  type CommunityPost,
  COMMUNITY_CATEGORIES,
  type CommunityCategory,
} from '../../lib/communityApi';

type Props = {
  onRequireSignIn?: (reason: string) => void;
  initialPostId?: string | null;
  onInitialPostConsumed?: () => void;
};

type CategoryFilter = CommunityCategory | 'all';

const CATEGORY_ICONS: Record<CommunityCategory, React.ComponentType<{ size?: number }>> = {
  bot_settings: Bot,
  referrals: Gift,
  crypto_bots: Wallet,
  betting: Ticket,
  help: HelpCircle,
  general: LayoutGrid,
};

function formatWhen(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

const ProTradeCommunity: React.FC<Props> = ({
  onRequireSignIn,
  initialPostId,
  onInitialPostConsumed,
}) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [allForCounts, setAllForCounts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState<CommunityCategory>('help');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<
    { type: 'post'; id: string } | { type: 'comment'; id: string } | null
  >(null);
  const [reportReason, setReportReason] = useState('');
  const [menuPostId, setMenuPostId] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ posts: rows, error: err }, { posts: allRows }] = await Promise.all([
      fetchCommunityPosts({ category, query, limit: 60 }),
      fetchCommunityPosts({ category: 'all', limit: 100 }),
    ]);
    setPosts(rows);
    setAllForCounts(allRows);
    setError(err);
    setLoading(false);
  }, [category, query]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    if (!initialPostId) return;
    setSelectedId(initialPostId);
    onInitialPostConsumed?.();
  }, [initialPostId, onInitialPostConsumed]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      setComments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setThreadLoading(true);
      setFormError(null);
      const [{ post, error: postErr }, { comments: rows, error: cErr }] = await Promise.all([
        fetchCommunityPost(selectedId),
        fetchCommunityComments(selectedId),
      ]);
      if (cancelled) return;
      if (postErr || !post) {
        setFormError(postErr ?? t('app.community.postMissing'));
        setSelected(null);
        setComments([]);
        setThreadLoading(false);
        return;
      }
      setSelected(post);
      setComments(rows);
      if (cErr) setFormError(cErr);
      setThreadLoading(false);
      if (user) {
        const views = await recordCommunityPostView(selectedId);
        if (cancelled || views == null) return;
        setSelected((prev) =>
          prev && prev.id === selectedId ? { ...prev, view_count: views } : prev
        );
        setPosts((prev) =>
          prev.map((p) => (p.id === selectedId ? { ...p, view_count: views } : p))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, t, user]);

  const topicCounts = useMemo(() => {
    const map = new Map<CommunityCategory, number>();
    for (const c of COMMUNITY_CATEGORIES) map.set(c, 0);
    for (const p of allForCounts) {
      map.set(p.category, (map.get(p.category) ?? 0) + 1);
    }
    return map;
  }, [allForCounts]);

  const activeTopicStats = useMemo(() => {
    const pool =
      category === 'all' ? allForCounts : allForCounts.filter((p) => p.category === category);
    return {
      posts: pool.length,
      comments: pool.reduce((s, p) => s + (p.comment_count || 0), 0),
      views: pool.reduce((s, p) => s + (p.view_count || 0), 0),
    };
  }, [allForCounts, category]);

  const requireUser = (reasonKey: string) => {
    if (user) return true;
    onRequireSignIn?.(t(reasonKey));
    return false;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(searchInput.trim());
    setSelectedId(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('hl-community-search-input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireUser('app.community.signInToPost')) return;
    if (!user) return;
    setBusy(true);
    setFormError(null);
    const { post, error: err } = await createCommunityPost({
      title: newTitle,
      body: newBody,
      category: newCategory,
      authorId: user.id,
    });
    setBusy(false);
    if (err || !post) {
      setFormError(err ?? t('app.community.createFailed'));
      return;
    }
    setNewTitle('');
    setNewBody('');
    setComposerOpen(false);
    setPosts((prev) => [post, ...prev]);
    setAllForCounts((prev) => [post, ...prev]);
    setSelectedId(post.id);
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !requireUser('app.community.signInToComment')) return;
    if (!user) return;
    setBusy(true);
    setFormError(null);
    const { comment, error: err } = await createCommunityComment({
      postId: selected.id,
      body: commentBody,
      authorId: user.id,
    });
    setBusy(false);
    if (err || !comment) {
      setFormError(err ?? t('app.community.commentFailed'));
      return;
    }
    setCommentBody('');
    setComments((prev) => [...prev, comment]);
    setSelected((prev) =>
      prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : prev
    );
    setPosts((prev) =>
      prev.map((p) =>
        p.id === selected.id ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p
      )
    );
  };

  const handleDelete = async (postId: string) => {
    if (!window.confirm(t('app.community.confirmDelete'))) return;
    setBusy(true);
    const result = await deleteCommunityPost(postId);
    setBusy(false);
    setMenuPostId(null);
    if (!result.ok) {
      setFormError(result.error ?? t('app.community.deleteFailed'));
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setAllForCounts((prev) => prev.filter((p) => p.id !== postId));
    if (selectedId === postId) setSelectedId(null);
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget || !requireUser('app.community.signInToReport')) return;
    if (!user) return;
    setBusy(true);
    setFormError(null);
    const result = await reportCommunityContent({
      reporterId: user.id,
      postId: reportTarget.type === 'post' ? reportTarget.id : undefined,
      commentId: reportTarget.type === 'comment' ? reportTarget.id : undefined,
      reason: reportReason,
    });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error ?? t('app.community.reportFailed'));
      return;
    }
    setReportTarget(null);
    setReportReason('');
    setMenuPostId(null);
    window.alert(t('app.community.reportSent'));
  };

  const pickCategory = (id: CategoryFilter) => {
    setCategory(id);
    setSelectedId(null);
    setComposerOpen(false);
  };

  const detailTitle =
    category === 'all'
      ? t('app.community.title')
      : t(`app.community.categories.${category}`);

  const DetailIcon =
    category === 'all' ? MessagesSquare : CATEGORY_ICONS[category];

  return (
    <div className="hl-community-page">
      <aside className="hl-com-rail">
        <div className="hl-com-rail__head">
          <h1>{t('app.community.titleShort')}</h1>
        </div>

        <form className="hl-com-search" onSubmit={handleSearch}>
          <Search size={15} aria-hidden />
          <input
            id="hl-community-search-input"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('app.community.searchPlaceholder')}
            aria-label={t('app.community.searchAria')}
          />
          <kbd>⌘K</kbd>
        </form>

        <div className="hl-com-rail__section">
          <p className="hl-com-rail__label">{t('app.community.topics')}</p>
          <button
            type="button"
            className={`hl-com-topic ${category === 'all' ? 'hl-com-topic--on' : ''}`}
            onClick={() => pickCategory('all')}
          >
            <span className="hl-com-topic__icon" aria-hidden>
              <MessagesSquare size={16} />
            </span>
            <span className="hl-com-topic__meta">
              <strong>{t('app.community.categories.all')}</strong>
              <span>{t('app.community.topicPosts', { count: allForCounts.length })}</span>
            </span>
          </button>
          {COMMUNITY_CATEGORIES.map((id) => {
            const Icon = CATEGORY_ICONS[id];
            const count = topicCounts.get(id) ?? 0;
            return (
              <button
                key={id}
                type="button"
                className={`hl-com-topic ${category === id ? 'hl-com-topic--on' : ''}`}
                onClick={() => pickCategory(id)}
              >
                <span className="hl-com-topic__icon" aria-hidden>
                  <Icon size={16} />
                </span>
                <span className="hl-com-topic__meta">
                  <strong>{t(`app.community.categories.${id}`)}</strong>
                  <span>{t('app.community.topicPosts', { count })}</span>
                </span>
                {count > 0 ? <span className="hl-com-topic__badge">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </aside>

      <main className="hl-com-feed">
        {composerOpen ? (
          <form className="hl-com-composer" onSubmit={(e) => void handleCreatePost(e)}>
            <h2>{t('app.community.newPost')}</h2>
            <div className="hl-com-composer__grid">
              <div>
                <label className="hl-com-label" htmlFor="hl-community-title">
                  {t('app.community.postTitle')}
                </label>
                <input
                  id="hl-community-title"
                  className="hl-com-input"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={120}
                  required
                  disabled={busy}
                />
              </div>
              <div>
                <label className="hl-com-label" htmlFor="hl-community-cat">
                  {t('app.community.category')}
                </label>
                <select
                  id="hl-community-cat"
                  className="hl-com-input"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as CommunityCategory)}
                  disabled={busy}
                >
                  {COMMUNITY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`app.community.categories.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="hl-com-label" htmlFor="hl-community-body">
              {t('app.community.postBody')}
            </label>
            <textarea
              id="hl-community-body"
              className="hl-com-textarea"
              rows={5}
              maxLength={8000}
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder={t('app.community.bodyPlaceholder')}
              required
              disabled={busy}
            />
            {formError ? (
              <p className="hl-com-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="hl-com-actions">
              <button type="button" className="hl-com-btn hl-com-btn--ghost" onClick={() => setComposerOpen(false)}>
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="hl-com-btn hl-com-btn--primary"
                disabled={busy || !newTitle.trim() || !newBody.trim()}
              >
                {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                {t('app.community.publish')}
              </button>
            </div>
          </form>
        ) : null}

        {selectedId ? (
          <div className="hl-com-thread">
            <button type="button" className="hl-com-back" onClick={() => setSelectedId(null)}>
              {t('app.community.back')}
            </button>
            {threadLoading || !selected ? (
              <div className="hl-com-loading">
                <Loader2 size={18} className="animate-spin" aria-hidden />
                {t('app.community.loading')}
              </div>
            ) : (
              <article className="hl-com-card hl-com-card--open">
                <header className="hl-com-card__head">
                  <div className="hl-com-card__author">
                    <span className="hl-com-avatar" aria-hidden>
                      {initials(authorLabel(selected))}
                    </span>
                    <div>
                      <strong>{authorLabel(selected)}</strong>
                      {selected.author_username ? (
                        <span className="hl-com-handle">@{selected.author_username}</span>
                      ) : null}
                    </div>
                  </div>
                  <span className="hl-com-pill">
                    {t(`app.community.categories.${selected.category}`)}
                  </span>
                </header>
                <h2 className="hl-com-card__title">{selected.title}</h2>
                <p className="hl-com-card__body">{selected.body}</p>
                <footer className="hl-com-card__foot">
                  <span>
                    <Eye size={14} aria-hidden /> {selected.view_count}
                  </span>
                  <span>
                    <MessageCircle size={14} aria-hidden /> {selected.comment_count}
                  </span>
                  <time>{formatWhen(selected.created_at, i18n.language)}</time>
                </footer>
                <div className="hl-com-actions">
                  {user?.id === selected.author_id ? (
                    <button
                      type="button"
                      className="hl-com-btn hl-com-btn--ghost"
                      disabled={busy}
                      onClick={() => void handleDelete(selected.id)}
                    >
                      <Trash2 size={14} aria-hidden />
                      {t('app.community.delete')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="hl-com-btn hl-com-btn--ghost"
                      onClick={() => setReportTarget({ type: 'post', id: selected.id })}
                    >
                      <Flag size={14} aria-hidden />
                      {t('app.community.report')}
                    </button>
                  )}
                </div>
              </article>
            )}

            {formError ? (
              <p className="hl-com-error" role="alert">
                {formError}
              </p>
            ) : null}

            <section className="hl-com-comments">
              <h3>{t('app.community.comments', { count: comments.length })}</h3>
              {comments.length === 0 ? (
                <p className="hl-com-muted">{t('app.community.noComments')}</p>
              ) : (
                <ul className="hl-com-comment-list">
                  {comments.map((c) => (
                    <li key={c.id} className="hl-com-comment">
                      <div className="hl-com-comment__head">
                        <span className="hl-com-avatar hl-com-avatar--sm" aria-hidden>
                          {initials(authorLabel(c))}
                        </span>
                        <strong>{authorLabel(c)}</strong>
                        <time>{formatWhen(c.created_at, i18n.language)}</time>
                        {user?.id !== c.author_id ? (
                          <button
                            type="button"
                            className="hl-com-link"
                            onClick={() => setReportTarget({ type: 'comment', id: c.id })}
                          >
                            <Flag size={12} aria-hidden />
                            {t('app.community.report')}
                          </button>
                        ) : null}
                      </div>
                      <p>{c.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              <form className="hl-com-comment-form" onSubmit={(e) => void handleComment(e)}>
                <textarea
                  className="hl-com-textarea"
                  rows={3}
                  maxLength={2000}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder={t('app.community.commentPlaceholder')}
                  disabled={busy}
                />
                <button
                  type="submit"
                  className="hl-com-btn hl-com-btn--primary"
                  disabled={busy || !commentBody.trim()}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <MessageCircle size={14} aria-hidden />}
                  {t('app.community.postComment')}
                </button>
              </form>
            </section>
          </div>
        ) : (
          <>
            {error ? (
              <p className="hl-com-error" role="alert">
                {error}
              </p>
            ) : null}
            {loading ? (
              <div className="hl-com-loading">
                <Loader2 size={18} className="animate-spin" aria-hidden />
                {t('app.community.loading')}
              </div>
            ) : posts.length === 0 ? (
              <div className="hl-com-empty">{t('app.community.empty')}</div>
            ) : (
              <ul className="hl-com-feed-list">
                {posts.map((post) => {
                  const label = authorLabel(post);
                  return (
                    <li key={post.id}>
                      <article className="hl-com-card">
                        <header className="hl-com-card__head">
                          <div className="hl-com-card__author">
                            <span className="hl-com-avatar" aria-hidden>
                              {initials(label)}
                            </span>
                            <div>
                              <strong>{label}</strong>
                              {post.author_username ? (
                                <span className="hl-com-handle">@{post.author_username}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="hl-com-card__tools">
                            <span className="hl-com-pill">
                              {t(`app.community.categories.${post.category}`)}
                            </span>
                            <div className="hl-com-menu">
                              <button
                                type="button"
                                className="hl-com-menu__btn"
                                aria-label={t('app.community.more')}
                                onClick={() =>
                                  setMenuPostId((id) => (id === post.id ? null : post.id))
                                }
                              >
                                ···
                              </button>
                              {menuPostId === post.id ? (
                                <div className="hl-com-menu__pop">
                                  {user?.id === post.author_id ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleDelete(post.id)}
                                    >
                                      <Trash2 size={13} aria-hidden />
                                      {t('app.community.delete')}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReportTarget({ type: 'post', id: post.id });
                                        setMenuPostId(null);
                                      }}
                                    >
                                      <Flag size={13} aria-hidden />
                                      {t('app.community.report')}
                                    </button>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </header>
                        <button
                          type="button"
                          className="hl-com-card__open"
                          onClick={() => setSelectedId(post.id)}
                        >
                          <h2 className="hl-com-card__title">{post.title}</h2>
                          <p className="hl-com-card__excerpt">
                            {post.body.length > 220 ? `${post.body.slice(0, 220)}…` : post.body}
                          </p>
                        </button>
                        <footer className="hl-com-card__foot">
                          <span>
                            <Eye size={14} aria-hidden /> {post.view_count}
                          </span>
                          <span>
                            <MessageCircle size={14} aria-hidden /> {post.comment_count}
                          </span>
                          <time>{formatWhen(post.created_at, i18n.language)}</time>
                        </footer>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>

      <aside className="hl-com-detail">
        <div className="hl-com-detail__head">
          <h2>{t('app.community.detailTitle')}</h2>
        </div>
        <div className="hl-com-detail__hero">
          <span className="hl-com-detail__icon" aria-hidden>
            <DetailIcon size={28} />
          </span>
          <h3>{detailTitle}</h3>
          <p>{t('app.community.detailLead')}</p>
        </div>

        <dl className="hl-com-detail__stats">
          <div>
            <dt>{t('app.community.statPosts')}</dt>
            <dd>{activeTopicStats.posts}</dd>
          </div>
          <div>
            <dt>{t('app.community.statComments')}</dt>
            <dd>{activeTopicStats.comments}</dd>
          </div>
          <div>
            <dt>{t('app.community.statViews')}</dt>
            <dd>{activeTopicStats.views}</dd>
          </div>
        </dl>

        <button
          type="button"
          className="hl-com-btn hl-com-btn--primary hl-com-btn--block"
          onClick={() => {
            if (!requireUser('app.community.signInToPost')) return;
            setComposerOpen(true);
            setSelectedId(null);
            if (category !== 'all') setNewCategory(category);
            setFormError(null);
          }}
        >
          <Plus size={16} aria-hidden />
          {t('app.community.createPost')}
        </button>
      </aside>

      {reportTarget ? (
        <div className="hl-com-modal" role="dialog" aria-modal="true">
          <form className="hl-com-modal__card" onSubmit={(e) => void handleReport(e)}>
            <h3>{t('app.community.reportTitle')}</h3>
            <p className="hl-com-muted">{t('app.community.reportLead')}</p>
            <textarea
              className="hl-com-textarea"
              rows={3}
              maxLength={500}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={t('app.community.reportPlaceholder')}
              required
            />
            <div className="hl-com-actions">
              <button
                type="button"
                className="hl-com-btn hl-com-btn--ghost"
                onClick={() => {
                  setReportTarget(null);
                  setReportReason('');
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="hl-com-btn hl-com-btn--primary"
                disabled={busy || reportReason.trim().length < 3}
              >
                {t('app.community.submitReport')}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};

export default ProTradeCommunity;
