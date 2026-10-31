import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MarketingPageLayout from '../components/layout/MarketingPageLayout';
import { BLOG_POSTS, formatBlogDate } from '../lib/blog/posts';

const BlogPage: React.FC = () => {
  const { t } = useTranslation();
  const [featured, ...rest] = BLOG_POSTS;

  return (
    <MarketingPageLayout inner>
      <div className="hg-blog">
        <header className="hg-blog-hero">
          <h1 className="hg-blog-hero-title">{t('blog.title')}</h1>
          <p className="hg-blog-hero-lead">{t('blog.lead')}</p>
        </header>

        {featured ? (
          <Link to={`/blog/${featured.slug}`} className="hg-blog-featured">
            <div className="hg-blog-featured-media">
              <img src={featured.cover} alt="" width={960} height={640} loading="eager" />
            </div>
            <h2 className="hg-blog-featured-title">{featured.title}</h2>
            <p className="hg-blog-featured-desc">{featured.description}</p>
          </Link>
        ) : null}

        {rest.length > 0 ? (
          <>
            <div className="hg-blog-recent-head">
              <h2 className="hg-blog-recent-title">{t('blog.recent')}</h2>
            </div>

            <ul className="hg-blog-list">
              {rest.map((post) => (
                <li key={post.slug}>
                  <Link to={`/blog/${post.slug}`} className="hg-blog-row">
                    <div className="hg-blog-row-media">
                      <img src={post.cover} alt="" width={480} height={320} loading="lazy" />
                    </div>
                    <div className="hg-blog-row-copy">
                      <h3 className="hg-blog-row-title">{post.title}</h3>
                      <p className="hg-blog-row-desc">{post.description}</p>
                      <div className="hg-blog-row-meta">
                        <span>{post.category}</span>
                        <span aria-hidden>·</span>
                        <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </MarketingPageLayout>
  );
};

export default BlogPage;
