import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  CircleDollarSign,
  Layers,
  Rocket,
  Shield,
  Sparkles,
} from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import MarketingPageLayout from '../components/layout/MarketingPageLayout';
import {
  DOCS_FAMILIAR,
  DOCS_FEATURED,
  docsArticlesAreEnglishFallback,
  getDocsArticle,
  getDocsSections,
  type DocsSectionId,
} from '../lib/docs/pages';

const FAMILIAR_ICONS = [BookOpen, CircleDollarSign, Shield, Sparkles] as const;

const DocsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';

  const sections = useMemo(
    () =>
      getDocsSections(lang, (id: DocsSectionId) =>
        t(`docs.sections.${id}`, { defaultValue: id })
      ),
    [lang, t]
  );

  const featured = useMemo(() => {
    const article = getDocsArticle(DOCS_FEATURED.slug, lang);
    return {
      slug: DOCS_FEATURED.slug,
      title: article?.title ?? DOCS_FEATURED.title,
      description: article?.description ?? DOCS_FEATURED.description,
    };
  }, [lang]);

  const familiar = useMemo(
    () =>
      DOCS_FAMILIAR.map((card) => {
        const article = getDocsArticle(card.slug, lang);
        return {
          slug: card.slug,
          title: article?.title ?? card.title,
          description: article?.description ?? card.description,
        };
      }),
    [lang]
  );

  const showEnNote = docsArticlesAreEnglishFallback(lang);

  return (
    <MarketingPageLayout inner>
      <div className="hg-docs">
        <aside className="hg-docs-sidebar" aria-label={t('docs.navLabel')}>
          {sections.map((section) => (
            <div key={section.id} className="hg-docs-sidebar__section">
              <p className="hg-docs-sidebar__heading">{section.title}</p>
              <ul className="hg-docs-sidebar__list">
                {section.items.map((item) => (
                  <li key={item.slug}>
                    <Link to={`/docs/${item.slug}`} className="hg-docs-sidebar__link">
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

        <div className="hg-docs-main">
          {showEnNote ? (
            <p className="hg-docs-lang-note" role="status">
              {t('docs.englishOnlyNote')}
            </p>
          ) : null}

          <Link to={`/docs/${featured.slug}`} className="hg-docs-callout">
            <span className="hg-docs-callout__icon" aria-hidden>
              <Rocket size={18} />
            </span>
            <span className="hg-docs-callout__copy">
              <strong>{featured.title}</strong>
              <span>{featured.description}</span>
            </span>
            <span className="hg-docs-callout__cta">{t('docs.learnMore')}</span>
          </Link>

          <header className="hg-docs-hero">
            <h1>
              <Trans
                i18nKey="docs.title"
                components={[<em className="hg-docs-em" key="em" />]}
              />
            </h1>
            <p>{t('docs.lead')}</p>
          </header>

          <section className="hg-docs-familiar" aria-labelledby="hg-docs-familiar-title">
            <h2 id="hg-docs-familiar-title">{t('docs.familiar')}</h2>
            <div className="hg-docs-familiar__grid">
              {familiar.map((card, i) => {
                const Icon = FAMILIAR_ICONS[i] ?? BookOpen;
                return (
                  <Link key={card.slug} to={`/docs/${card.slug}`} className="hg-docs-familiar__card">
                    <span className="hg-docs-familiar__icon" aria-hidden>
                      <Icon size={18} />
                    </span>
                    <span className="hg-docs-familiar__copy">
                      <strong>{card.title}</strong>
                      <span>{card.description}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="hg-docs-browse" aria-labelledby="hg-docs-browse-title">
            <h2 id="hg-docs-browse-title">{t('docs.browse')}</h2>
            <ul className="hg-docs-browse__list">
              {sections.flatMap((s) => s.items).map((item) => (
                <li key={item.slug}>
                  <Link to={`/docs/${item.slug}`} className="hg-docs-browse__row">
                    <span>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </MarketingPageLayout>
  );
};

export default DocsPage;
