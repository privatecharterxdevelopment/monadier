import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MarketingPageLayout from '../components/layout/MarketingPageLayout';
import { formatBlogDate, getBlogPost } from '../lib/blog/posts';
import { SITE_NAME, absoluteUrl } from '../lib/seo/site';

const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const post = slug ? getBlogPost(slug) : undefined;

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  const title = `${post.title} — ${SITE_NAME} Blog`;
  const canonical = absoluteUrl(`/blog/${post.slug}`);

  return (
    <MarketingPageLayout inner>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={post.description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={post.description} />
        <meta property="og:url" content={canonical} />
      </Helmet>
      <article className="hg-blog-article">
        <Link to="/blog" className="hg-blog-back">
          <ArrowLeft size={16} strokeWidth={2.25} aria-hidden />
          {t('blog.back')}
        </Link>

        <div className="hg-blog-article-meta">
          <span>{post.category}</span>
          <span aria-hidden>·</span>
          <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
        </div>

        <h1 className="hg-blog-article-title">{post.title}</h1>
        <p className="hg-blog-article-lead">{post.description}</p>

        <div className="hg-blog-article-cover">
          <img src={post.cover} alt="" width={960} height={640} />
        </div>

        <div className="hg-blog-article-body">
          {post.body.map((para) => (
            <p key={para.slice(0, 32)}>{para}</p>
          ))}
        </div>
      </article>
    </MarketingPageLayout>
  );
};

export default BlogPostPage;
