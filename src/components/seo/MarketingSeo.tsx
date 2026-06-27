import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { getPageSeo } from '../../lib/seo/pages';
import { TRADING_BOT_FAQS } from '../../lib/seo/tradingBotContent';
import { BETTING_FAQS } from '../../lib/seo/bettingContent';
import { OG_IMAGE, SITE_NAME, absoluteUrl } from '../../lib/seo/site';
import {
  breadcrumbSchema,
  faqPageSchema,
  organizationSchema,
  softwareApplicationSchema,
  webPageSchema,
  webSiteSchema,
} from '../../lib/seo/schema';

type Props = {
  /** Override path for hash routes like /how-it-works#funds */
  path?: string;
  /** FAQ items for FAQPage JSON-LD */
  faqs?: { q: string; a: string }[];
};

const MarketingSeo: React.FC<Props> = ({ path: pathOverride, faqs }) => {
  const location = useLocation();
  const path = pathOverride ?? location.pathname;
  const seo = getPageSeo(path);
  const canonical = absoluteUrl(seo.path);

  const faqItems =
    faqs ??
    (path === '/trading-bot'
      ? TRADING_BOT_FAQS
      : path === '/sports-betting'
        ? BETTING_FAQS
        : undefined);

  const jsonLd = useMemo(() => {
    const blocks: object[] = [webPageSchema({ path: seo.path, title: seo.title, description: seo.description })];

    if (path === '/') {
      blocks.push(organizationSchema(), webSiteSchema(), softwareApplicationSchema());
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
    } else if (path === '/sports-betting') {
      blocks.push(
        breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Sports Betting', path: '/sports-betting' },
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
  }, [faqItems, path, seo.description, seo.path, seo.title]);

  return (
    <Helmet>
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      {seo.keywords && <meta name="keywords" content={seo.keywords} />}
      <meta
        name="robots"
        content={seo.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}
      />
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonical} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={seo.title} />
      <meta property="og:description" content={seo.description} />
      <meta property="og:image" content={OG_IMAGE} />
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
