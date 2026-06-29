import { OG_IMAGE, SITE_NAME, SITE_ORIGIN, SUPPORT_EMAIL } from './site';

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_ORIGIN,
    logo: OG_IMAGE,
    email: SUPPORT_EMAIL,
    description:
      'Non-custodial Hyperliquid trading bot — full auto 24/7 perpetuals execution across 200+ markets.',
    sameAs: [] as string[],
  };
}

export function webSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_ORIGIN,
    description:
      'Full auto Hyperliquid trading bot with non-custodial USDC on HL, live charts, and 24/7 automated execution.',
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_ORIGIN,
    },
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
      'Full auto Hyperliquid trading bot. Non-custodial USDC on HL, 200+ perpetual markets, 24/7 automated execution.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'No platform subscription; no Monadier success fee on closes',
    },
    featureList: [
      'Full auto Hyperliquid trading bot',
      'Non-custodial Hyperliquid account trading',
      '200+ Hyperliquid perpetual markets',
      '24/7 passive income automation',
      'Live chart terminal',
      'Automated risk management',
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
