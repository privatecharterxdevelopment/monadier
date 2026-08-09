import { OFFICIAL_X_URL } from '../brand';
import { OG_IMAGE, SITE_NAME, SITE_ORIGIN, SUPPORT_EMAIL } from './site';
import { GOOGLE_SITELINKS, sitelinkUrl } from './sitelinks';

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_ORIGIN,
    logo: OG_IMAGE,
    email: SUPPORT_EMAIL,
    description:
      'Non-custodial Hyperliquid trading bot — full auto 24/7 perpetuals execution across 200+ markets. No guaranteed returns.',
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
      'Full auto Hyperliquid trading bot. Native USDC on Arbitrum → Hyperliquid, non-custodial agent, 24/7 automation across 200+ perps.',
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
    name: opts?.name ?? `${SITE_NAME} Hyperliquid Trading Bot`,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: opts?.path ? `${SITE_ORIGIN}${opts.path}` : SITE_ORIGIN,
    description:
      opts?.description ??
      'Full auto Hyperliquid trading bot. Native USDC on Arbitrum → Hyperliquid, non-custodial agent, 24/7 across 200+ perps. No guaranteed returns.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description:
        'No monthly subscription; Hyperliquid fees apply; Platform Success Fee may apply on profitable closes as disclosed',
    },
    featureList: [
      'Full auto Hyperliquid trading bot',
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
      name: `${SITE_NAME} Hyperliquid Trading Bot`,
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
