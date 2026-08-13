import { OFFICIAL_X_URL } from '../brand';
import { OG_IMAGE, SITE_NAME, SITE_ORIGIN, SUPPORT_EMAIL } from './site';
import { GOOGLE_SITELINKS, sitelinkUrl } from './sitelinks';
import { HOW_IT_WORKS_IMAGES, HOW_IT_WORKS_STEP_SCHEMA } from './howItWorksImages';

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_ORIGIN,
    logo: OG_IMAGE,
    email: SUPPORT_EMAIL,
    description:
      'Non-custodial Hyperliquid trading agent — full auto 24/7 perpetuals execution across 200+ markets. No guaranteed returns.',
    sameAs: [OFFICIAL_X_URL],
  };
}

export function webSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    name: SITE_NAME,
    url: SITE_ORIGIN,
    description:
      'Full auto Hyperliquid trading agent. Native USDC on Arbitrum → Hyperliquid, non-custodial agent, 24/7 automation across 200+ perps.',
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_ORIGIN,
    },
    hasPart: GOOGLE_SITELINKS.map((link) => ({
      '@type': 'WebPage',
      name: link.name,
      url: sitelinkUrl(link),
    })),
  };
}

/** Helps Google understand primary destination pages (sitelink candidates). */
export function siteNavigationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${SITE_NAME} primary links`,
    itemListElement: GOOGLE_SITELINKS.map((link, i) => ({
      '@type': 'SiteNavigationElement',
      position: i + 1,
      name: link.name,
      url: sitelinkUrl(link),
    })),
  };
}

export function softwareApplicationSchema(opts?: { path?: string; name?: string; description?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: opts?.name ?? 'HyperGain - full-auto AI trading agent on hyperliquid 24/7',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: opts?.path ? `${SITE_ORIGIN}${opts.path}` : SITE_ORIGIN,
    description:
      opts?.description ??
      'HyperGain - full-auto AI trading agent on Hyperliquid 24/7. Automated perps, USDC on Arbitrum, 200+ markets. No guaranteed returns.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description:
        'No monthly subscription; Hyperliquid fees apply; Platform Success Fee may apply on profitable closes as disclosed',
    },
    featureList: [
      'Full auto Hyperliquid trading agent',
      'Non-custodial Hyperliquid account trading',
      'Native USDC on Arbitrum One deposits',
      '200+ Hyperliquid perpetual markets',
      '24/7 automated execution',
      'Configurable risk management',
    ],
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_ORIGIN}${item.path}`,
    })),
  };
}

export function webPageSchema(opts: { path: string; title: string; description: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${SITE_ORIGIN}${opts.path}`,
    name: opts.title,
    description: opts.description,
    url: `${SITE_ORIGIN}${opts.path}`,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      name: SITE_NAME,
      url: SITE_ORIGIN,
    },
    about: {
      '@type': 'SoftwareApplication',
      name: `${SITE_NAME} Hyperliquid Trading Agent`,
      applicationCategory: 'FinanceApplication',
    },
  };
}

export function faqPageSchema(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

/** HowTo + ImageObject — helps Google Images index the product screenshots. */
export function howToSchema() {
  const images = HOW_IT_WORKS_IMAGES.map((img) => `${SITE_ORIGIN}${img.src}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How ${SITE_NAME} agent works on Hyperliquid`,
    description:
      'Deposit USDC on Hyperliquid, set simple agent settings and 2 or 3 slots, then start the agent. No API keys, no exchange connections.',
    image: images,
    url: `${SITE_ORIGIN}/how-it-works`,
    step: HOW_IT_WORKS_IMAGES.map((img, i) => {
      const copy = HOW_IT_WORKS_STEP_SCHEMA[img.id];
      return {
        '@type': 'HowToStep',
        position: i + 1,
        name: copy.name,
        text: copy.text,
        url: `${SITE_ORIGIN}/how-it-works#hiw-${img.id}`,
        image: `${SITE_ORIGIN}${img.src}`,
      };
    }),
  };
}

export function howItWorksImageSchema() {
  return HOW_IT_WORKS_IMAGES.map((img) => ({
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    contentUrl: `${SITE_ORIGIN}${img.src}`,
    url: `${SITE_ORIGIN}${img.src}`,
    name: img.seoTitle,
    description: img.seoCaption,
    caption: img.seoCaption,
    width: img.width,
    height: img.height,
    encodingFormat: 'image/png',
    representativeOfPage: img.id === 'funds',
    isPartOf: {
      '@type': 'WebPage',
      '@id': `${SITE_ORIGIN}/how-it-works`,
      url: `${SITE_ORIGIN}/how-it-works`,
    },
  }));
}
