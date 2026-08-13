import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ChevronRight, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MarketingPageLayout from '../components/layout/MarketingPageLayout';
import { DOCS_SECTIONS, getDocsArticle } from '../lib/docs/pages';
import { SITE_NAME, absoluteUrl } from '../lib/seo/site';

const DocsArticlePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const article = slug ? getDocsArticle(slug) : undefined;

  if (!article) {
    return <Navigate to="/docs" replace />;
  }

  const title = `${article.title} — ${SITE_NAME} Docs`;
  const canonical = absoluteUrl(`/docs/${article.slug}`);

  return (
    <MarketingPageLayout inner>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={article.description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={article.description} />
        <meta property="og:url" content={canonical} />
      </Helmet>

      <div className="hg-docs">
        <aside className="hg-docs-sidebar" aria-label={t('docs.navLabel')}>
          {DOCS_SECTIONS.map((section) => (
            <div key={section.id} className="hg-docs-sidebar__section">
              <p className="hg-docs-sidebar__heading">{section.title}</p>
              <ul className="hg-docs-sidebar__list">
                {section.items.map((item) => (
                  <li key={item.slug}>
                    <Link
                      to={`/docs/${item.slug}`}
                      className={`hg-docs-sidebar__link${item.slug === article.slug ? ' is-on' : ''}`}
                    >
                      <Layers size={15} aria-hidden />
                      <span>{item.title}</span>
                      <ChevronRight size={14} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <article className="hg-docs-main hg-docs-article">
          <Link to="/docs" className="hg-docs-back">
            <ArrowLeft size={16} strokeWidth={2.25} aria-hidden />
            {t('docs.back')}
          </Link>
          <p className="hg-docs-article__section">
            {DOCS_SECTIONS.find((s) => s.id === article.section)?.title}
          </p>
          <h1>{article.title}</h1>
          <p className="hg-docs-article__lead">{article.description}</p>
          <div className="hg-docs-article__body">
            {article.body.map((para) => (
              <p key={para.slice(0, 40)}>{para}</p>
            ))}
          </div>
        </article>
      </div>
    </MarketingPageLayout>
  );
};

export default DocsArticlePage;
