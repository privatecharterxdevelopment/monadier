import React, { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ChevronRight, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MarketingPageLayout from '../components/layout/MarketingPageLayout';
import {
  docsArticlesAreEnglishFallback,
  getDocsArticle,
  getDocsSections,
  type DocsSectionId,
} from '../lib/docs/pages';
import { getDocsSeoImage } from '../lib/seo/docsImages';
import { docsImageObjectSchema } from '../lib/seo/schema';
import { SITE_NAME, SITE_ORIGIN, absoluteUrl } from '../lib/seo/site';

const DocsArticlePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const article = slug ? getDocsArticle(slug, lang) : undefined;

  const sections = useMemo(
    () =>
      getDocsSections(lang, (id: DocsSectionId) =>
        t(`docs.sections.${id}`, { defaultValue: id })
      ),
    [lang, t]
  );

  if (!article) {
    return <Navigate to="/docs" replace />;
  }

  const title = `${article.title} — ${SITE_NAME} Docs`;
  const canonical = absoluteUrl(`/docs/${article.slug}`);
  const seoImage = getDocsSeoImage(article.slug);
  const ogImage = seoImage ? `${SITE_ORIGIN}${seoImage.src}` : undefined;
  const sectionLabel =
    sections.find((s) => s.id === article.section)?.title ??
    t(`docs.sections.${article.section}`, { defaultValue: article.section });
  const showEnNote = docsArticlesAreEnglishFallback(lang);

  return (
    <MarketingPageLayout inner>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={article.description} />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={article.description} />
        <meta property="og:url" content={canonical} />
        {ogImage ? (
          <>
            <meta property="og:image" content={ogImage} />
            <meta property="og:image:secure_url" content={ogImage} />
            <meta property="og:image:width" content={String(seoImage!.width)} />
            <meta property="og:image:height" content={String(seoImage!.height)} />
            <meta property="og:image:alt" content={seoImage!.alt} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:image" content={ogImage} />
          </>
        ) : null}
        {seoImage ? (
          <script type="application/ld+json">
            {JSON.stringify(docsImageObjectSchema(seoImage))}
          </script>
        ) : null}
      </Helmet>

      <div className="hg-docs">
        <aside className="hg-docs-sidebar" aria-label={t('docs.navLabel')}>
          {sections.map((section) => (
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
          {showEnNote ? (
            <p className="hg-docs-lang-note" role="status">
              {t('docs.englishOnlyNote')}
            </p>
          ) : null}
          <p className="hg-docs-article__section">{sectionLabel}</p>
          <h1>{article.title}</h1>
          <p className="hg-docs-article__lead">{article.description}</p>
          {seoImage ? (
            <figure className="hg-docs-article__figure">
              <img
                src={seoImage.src}
                alt={seoImage.alt}
                title={seoImage.seoTitle}
                width={seoImage.width}
                height={seoImage.height}
                loading="eager"
                decoding="async"
              />
              <figcaption>{seoImage.seoCaption}</figcaption>
            </figure>
          ) : null}
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
