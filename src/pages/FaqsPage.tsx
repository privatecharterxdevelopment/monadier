import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MarketingInnerPage, {
  MarketingPageHero,
} from '../components/marketing/MarketingInnerPage';
import MarketingFaqAccordion from '../components/marketing/MarketingFaqAccordion';
import type { LandingFaqItem } from '../lib/supportFaq';

const FaqsPage: React.FC = () => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const allFaqs = useMemo(() => {
    const items = t('landing.faq.items', { returnObjects: true });
    return Array.isArray(items) ? (items as LandingFaqItem[]) : [];
  }, [t]);

  const visibleFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allFaqs;
    return allFaqs.filter(
      (item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
    );
  }, [allFaqs, query]);

  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow={t('landing.faq.page.eyebrow')}
        title={t('landing.faq.page.title')}
        lead={t('landing.faq.page.lead')}
      />

      <label className="landing-gmx-faq-search landing-gmx-faq-search--page">
        <Search size={16} strokeWidth={2} aria-hidden className="landing-gmx-faq-search-icon" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('landing.faq.searchPlaceholder')}
          aria-label={t('landing.faq.searchPlaceholder')}
        />
      </label>

      {visibleFaqs.length === 0 ? (
        <p className="landing-gmx-faq-empty">{t('landing.faq.searchEmpty')}</p>
      ) : (
        <MarketingFaqAccordion items={visibleFaqs} idPrefix="faqs-page" />
      )}
    </MarketingInnerPage>
  );
};

export default FaqsPage;
