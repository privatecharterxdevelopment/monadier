/**
 * HyperGain Docs — Aave-style documentation structure.
 * Article copy lives in src/content/docs/articles/<lang>.json
 */

import enArticles from '../../content/docs/articles/en.json';
import deArticles from '../../content/docs/articles/de.json';
import esArticles from '../../content/docs/articles/es.json';
import zhArticles from '../../content/docs/articles/zh.json';
import jaArticles from '../../content/docs/articles/ja.json';
import thArticles from '../../content/docs/articles/th.json';
import itArticles from '../../content/docs/articles/it.json';
import ruArticles from '../../content/docs/articles/ru.json';
import hiArticles from '../../content/docs/articles/hi.json';
import urArticles from '../../content/docs/articles/ur.json';

export type DocsSectionId = 'introduction' | 'getting-started' | 'agent' | 'funds' | 'betting';

export type DocsNavItem = {
  slug: string;
  title: string;
  description: string;
  section: DocsSectionId;
};

export type DocsSection = {
  id: DocsSectionId;
  title: string;
  items: DocsNavItem[];
};

export type DocsArticle = DocsNavItem & {
  body: string[];
};

type DocsArticleCopy = {
  title: string;
  description: string;
  body: string[];
};

/** Slug order + section membership (language-agnostic). */
const ARTICLE_META: { slug: string; section: DocsSectionId }[] = [
  { slug: 'what-is-hypergain-io', section: 'introduction' },
  { slug: 'overview', section: 'introduction' },
  { slug: 'hypergain-101', section: 'introduction' },
  { slug: 'getting-started', section: 'getting-started' },
  { slug: 'non-custodial', section: 'funds' },
  { slug: 'profit-trailing', section: 'agent' },
  { slug: 'leaderboard', section: 'agent' },
  { slug: 'fees', section: 'funds' },
  { slug: 'depositing-bridging-hyperliquid', section: 'funds' },
  { slug: 'deposit-successful-no-extra-fees', section: 'funds' },
  { slug: 'sports-betting', section: 'betting' },
];

const ARTICLE_PACKS: Record<string, Record<string, DocsArticleCopy>> = {
  en: enArticles,
  de: deArticles,
  es: esArticles,
  zh: zhArticles,
  ja: jaArticles,
  th: thArticles,
  it: itArticles,
  ru: ruArticles,
  hi: hiArticles,
  ur: urArticles,
};

/** Locales with full docs article translations. */
export const DOCS_ARTICLE_LOCALES = new Set(Object.keys(ARTICLE_PACKS));

function langBase(lang: string): string {
  return (lang || 'en').toLowerCase().split('-')[0] || 'en';
}

function packFor(lang: string): Record<string, DocsArticleCopy> {
  return ARTICLE_PACKS[langBase(lang)] ?? ARTICLE_PACKS.en;
}

function buildArticle(
  meta: { slug: string; section: DocsSectionId },
  copy: DocsArticleCopy
): DocsArticle {
  return {
    slug: meta.slug,
    section: meta.section,
    title: copy.title,
    description: copy.description,
    body: copy.body,
  };
}

/** True when article body falls back to English for this UI language. */
export function docsArticlesAreEnglishFallback(lang: string): boolean {
  return !DOCS_ARTICLE_LOCALES.has(langBase(lang));
}

export function getDocsArticle(slug: string, lang = 'en'): DocsArticle | undefined {
  const meta = ARTICLE_META.find((a) => a.slug === slug);
  if (!meta) return undefined;
  const copy = packFor(lang)[slug] ?? ARTICLE_PACKS.en[slug];
  if (!copy) return undefined;
  return buildArticle(meta, copy);
}

export function getAllDocsArticles(lang = 'en'): DocsArticle[] {
  return ARTICLE_META.map((meta) => getDocsArticle(meta.slug, lang)!);
}

export function getDocsSections(
  lang: string,
  sectionTitle: (id: DocsSectionId) => string
): DocsSection[] {
  const articles = getAllDocsArticles(lang);
  return [
    {
      id: 'introduction',
      title: sectionTitle('introduction'),
      items: articles.filter((a) => a.section === 'introduction'),
    },
    {
      id: 'getting-started',
      title: sectionTitle('getting-started'),
      items: articles.filter((a) => a.section === 'getting-started'),
    },
    {
      id: 'agent',
      title: sectionTitle('agent'),
      items: articles.filter((a) => a.section === 'agent'),
    },
    {
      id: 'funds',
      title: sectionTitle('funds'),
      items: articles.filter((a) => a.section === 'funds'),
    },
    {
      id: 'betting',
      title: sectionTitle('betting'),
      items: articles.filter((a) => a.section === 'betting'),
    },
  ];
}

export const DOCS_FEATURED = {
  slug: 'what-is-hypergain-io',
  title: ARTICLE_PACKS.en['what-is-hypergain-io'].title,
  description: ARTICLE_PACKS.en['what-is-hypergain-io'].description,
};

export const DOCS_FAMILIAR = [
  {
    slug: 'what-is-hypergain-io',
    title: ARTICLE_PACKS.en['what-is-hypergain-io'].title,
    description: ARTICLE_PACKS.en['what-is-hypergain-io'].description,
  },
  {
    slug: 'depositing-bridging-hyperliquid',
    title: ARTICLE_PACKS.en['depositing-bridging-hyperliquid'].title,
    description: ARTICLE_PACKS.en['depositing-bridging-hyperliquid'].description,
  },
  {
    slug: 'deposit-successful-no-extra-fees',
    title: ARTICLE_PACKS.en['deposit-successful-no-extra-fees'].title,
    description: ARTICLE_PACKS.en['deposit-successful-no-extra-fees'].description,
  },
  {
    slug: 'fees',
    title: ARTICLE_PACKS.en.fees.title,
    description: ARTICLE_PACKS.en.fees.description,
  },
];
