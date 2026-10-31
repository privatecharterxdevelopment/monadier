import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2, MessageCircle, MessagesSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  authorLabel,
  fetchMyCommunityComments,
  fetchMyCommunityStats,
  type CommunityPost,
  type MyCommunityComment,
} from '../../lib/communityApi';

type Props = {
  onOpenPost?: (postId: string) => void;
};

const ProTradeMyCommunityPosts: React.FC<Props> = ({ onOpenPost }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [myComments, setMyComments] = useState<MyCommunityComment[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [totalComments, setTotalComments] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setPosts([]);
      setMyComments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [stats, commentsResult] = await Promise.all([
      fetchMyCommunityStats(user.id),
      fetchMyCommunityComments(user.id),
    ]);
    setPosts(stats.posts);
    setTotalViews(stats.totalViews);
    setTotalComments(stats.totalComments);
    setMyComments(commentsResult.comments);
    setError(stats.error || commentsResult.error);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatWhen = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <section className="hl-my-posts-card">
      <header className="hl-my-posts-head">
        <MessagesSquare size={18} aria-hidden />
        <span>{t('profile.myPosts.title')}</span>
      </header>
      <div>
        <p className="hl-com-muted">{t('profile.myPosts.lead')}</p>

        <div className="hl-my-posts-kpis" aria-label={t('profile.myPosts.statsAria')}>
          <div>
            <strong>{posts.length}</strong>
            <span>{t('profile.myPosts.posts')}</span>
          </div>
          <div>
            <strong>{totalViews}</strong>
            <span>{t('profile.myPosts.views')}</span>
          </div>
          <div>
            <strong>{totalComments}</strong>
            <span>{t('profile.myPosts.commentsOnPosts')}</span>
          </div>
          <div>
            <strong>{myComments.length}</strong>
            <span>{t('profile.myPosts.myComments')}</span>
          </div>
        </div>

        {loading ? (
          <div className="hl-com-loading">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            {t('app.community.loading')}
          </div>
        ) : null}

        {error ? (
          <p className="hl-com-error" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && posts.length === 0 ? (
          <p className="hl-com-empty">{t('profile.myPosts.empty')}</p>
        ) : null}

        <ul className="hl-com-feed-list" style={{ marginTop: 12 }}>
          {posts.map((post) => (
            <li key={post.id}>
              <button
                type="button"
                className="hl-com-card"
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => onOpenPost?.(post.id)}
              >
                <div className="hl-com-card__head">
                  <span className="hl-com-pill">
                    {t(`app.community.categories.${post.category}`)}
                  </span>
                  <span className="hl-com-muted">{formatWhen(post.created_at)}</span>
                </div>
                <strong className="hl-com-card__title">{post.title}</strong>
                <div className="hl-com-card__foot">
                  <span>{authorLabel(post)}</span>
                  <span>
                    <Eye size={12} aria-hidden /> {post.view_count}
                  </span>
                  <span>
                    <MessageCircle size={12} aria-hidden /> {post.comment_count}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>

        <h3 className="hl-my-posts-head" style={{ marginTop: 28, fontSize: 14 }}>
          <MessageCircle size={16} aria-hidden />
          <span>{t('profile.myPosts.commentsTitle')}</span>
        </h3>
        <p className="hl-com-muted">{t('profile.myPosts.commentsLead')}</p>

        {!loading && myComments.length === 0 ? (
          <p className="hl-com-empty">{t('profile.myPosts.commentsEmpty')}</p>
        ) : null}

        <ul className="hl-com-feed-list" style={{ marginTop: 12 }}>
          {myComments.map((comment) => (
            <li key={comment.id}>
              <button
                type="button"
                className="hl-com-card"
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => onOpenPost?.(comment.post_id)}
              >
                <div className="hl-com-card__head">
                  <span className="hl-com-pill">{t('profile.myPosts.commentPill')}</span>
                  <span className="hl-com-muted">{formatWhen(comment.created_at)}</span>
                </div>
                {comment.post_title ? (
                  <strong className="hl-com-card__title">{comment.post_title}</strong>
                ) : null}
                <p className="hl-com-muted" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>
                  {comment.body}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default ProTradeMyCommunityPosts;
