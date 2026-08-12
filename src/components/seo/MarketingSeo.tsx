import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPageSeo } from '../../lib/seo/pages';
import { TRADING_BOT_FAQS } from '../../lib/seo/tradingBotContent';
import { BETTING_FAQS } from '../../lib/seo/bettingContent';
import { LEADERBOARD_PAGE_FAQS } from '../../lib/seo/leaderboardContent';
import { OG_IMAGE, SITE_NAME, absoluteUrl } from '../../lib/seo/site';
import {
  breadcrumbSchema,
  faqPageSchema,
  howItWorksImageSchema,
  howToSchema,
  organizationSchema,
  softwareApplicationSchema,
  webPageSchema,
  webSiteSchema,
  siteNavigationSchema,
} from '../../lib/seo/schema';

type FaqItem = { q: string; a: string };

type Props = {
  /** Override path for hash routes like /how-it-works#funds */
  path?: string;
  /** FAQ items for FAQPage JSON-LD */
  faqs?: FaqItem[];
};

function normalizeFaqs(
  items: Array<{ q?: string; a?: string; question?: string; answer?: string }> | undefined
): FaqItem[] | undefined {
  if (!items?.length) return undefined;
  const out = items
    .map((item) => ({
      q: (item.q ?? item.question ?? '').trim(),
      a: (item.a ?? item.answer ?? '').trim(),
    }))
    .filter((item) => item.q && item.a);
  return out.length ? out : undefined;
}

const MarketingSeo: React.FC<Props> = ({ path: pathOverride, faqs }) => {
  const location = useLocation();
  const { t } = useTranslation();
  const path = pathOverride ?? location.pathname;
  const seo = getPageSeo(path);
  const canonical = absoluteUrl(seo.path);
  const robots = seo.noindex
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large';

  const landingFaqItems = useMemo(() => {
    if (path !== '/faqs' || faqs) return undefined;
    const items = t('landing.faq.items', { returnObjects: true });
    return Array.isArray(items) ? normalizeFaqs(items as FaqItem[]) : undefined;
  }, [faqs, path, t]);

  const faqItems = useMemo(() => {
    if (faqs) return normalizeFaqs(faqs);
    if (landingFaqItems) return landingFaqItems;
    if (path === '/trading-bot') return [...TRADING_BOT_FAQS];
    if (path === '/ai-sports-betting') return [...BETTING_FAQS];
    if (path === '/leaderboard') return [...LEADERBOARD_PAGE_FAQS];
    return undefined;
  }, [faqs, landingFaqItems, path]);

  const jsonLd = useMemo(() => {
    /* Skip rich schema on noindex pages — avoid mixed ranking signals */
    if (seo.noindex) {
      return [webPageSchema({ path: seo.path, title: seo.title, description: seo.description })];
    }

    const blocks: object[] = [
      webPageSchema({ path: seo.path, title: seo.title, description: seo.description }),
    ];

    if (path === '/') {
      blocks.push(
        organizationSchema(),
        webSiteSchema(),
        siteNavigationSchema(),
        softwareApplicationSchema(),
        howToSchema(),
        ...howItWorksImageSchema()
      );
    } else if (path === '/how-it-works') {
      blocks.push(
        howToSchema(),
        ...howItWorksImageSchema(),
        breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'How it works', path: '/how-it-works' },
        ])
      );
    } else if (path === '/trading-bot') {
      blocks.push(
        softwareApplicationSchema({
          path: '/trading-bot',
          name: `${SITE_NAME} Hyperliquid Trading Bot`,
          description: seo.description,
        }),
        breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Hyperliquid Trading Bot', path: '/trading-bot' },
        ])
      );
    } else {
      const label = seo.title.split('|')[0]?.trim() ?? seo.path;
      blocks.push(
        breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: label, path: seo.path },
        ])
      );
    }

    if (faqItems?.length) {
      blocks.push(faqPageSchema(faqItems));
    }

    return blocks;
  }, [faqItems, path, seo.description, seo.noindex, seo.path, seo.title]);

  return (
    <Helmet>
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      {seo.keywords && <meta name="keywords" content={seo.keywords} />}
      <meta name="robots" content={robots} />
      <meta name="googlebot" content={robots} />
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonical} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={seo.title} />
      <meta property="og:description" content={seo.description} />
      <meta property="og:image" content={OG_IMAGE} />
      <meta property="og:image:secure_url" content={OG_IMAGE} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale" content="en_US" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={seo.title} />
      <meta name="twitter:description" content={seo.description} />
      <meta name="twitter:image" content={OG_IMAGE} />

      {jsonLd.map((block, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
};

export default MarketingSeo;
