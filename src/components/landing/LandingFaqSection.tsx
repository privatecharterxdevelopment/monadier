import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] },
});

export type FaqTabId = 'all' | 'platform' | 'bot' | 'vault' | 'betting';

type FaqItem = {
  tab: Exclude<FaqTabId, 'all'>;
  q: string;
  a: string;
};

const FAQ_TAB_IDS: FaqTabId[] = ['all', 'platform', 'bot', 'betting', 'vault'];

const LandingFaqSection: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<FaqTabId>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const landingFaqs = useMemo(() => {
    const items = t('landing.faq.items', { returnObjects: true });
    return Array.isArray(items) ? (items as FaqItem[]) : [];
  }, [t]);

  const visibleFaqs =
    activeTab === 'all' ? landingFaqs : landingFaqs.filter((item) => item.tab === activeTab);

  const faqSchema = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: landingFaqs.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    }),
    [landingFaqs]
  );

  const toggle = (q: string) => {
    setOpenKey((prev) => (prev === q ? null : q));
  };

  const selectTab = (tab: FaqTabId) => {
    setActiveTab(tab);
    setOpenKey(null);
  };

  const activeTabLabel = t(`landing.faq.tabs.${activeTab}`);

  return (
    <section
      className="landing-gmx-section landing-gmx-gutter landing-gmx-faq-section"
      aria-labelledby="landing-faq-title"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <motion.div {...fadeUp(0)} className="landing-gmx-faq-frame">
          <h2 id="landing-faq-title" className="landing-gmx-faq-frame-title">
            <span className="landing-gmx-title-dark">{t('landing.faq.titleDark')}</span>
            <span className="landing-gmx-title-grey">{t('landing.faq.titleGrey')}</span>
          </h2>

          <div className="landing-gmx-faq-tabs" role="tablist">
            {FAQ_TAB_IDS.map((tabId) => (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={activeTab === tabId}
                className={`landing-gmx-faq-tab${activeTab === tabId ? ' landing-gmx-faq-tab--active' : ''}`}
                onClick={() => selectTab(tabId)}
              >
                {t(`landing.faq.tabs.${tabId}`)}
              </button>
            ))}
          </div>

          <div
            className="landing-gmx-faq-grid"
            role="tabpanel"
            aria-label={t('landing.faq.tabPanelLabel', { tab: activeTabLabel })}
          >
            {visibleFaqs.map((item, i) => {
              const isOpen = openKey === item.q;
              const panelId = `landing-faq-panel-${activeTab}-${i}`;
              const buttonId = `landing-faq-button-${activeTab}-${i}`;

              return (
                <motion.div
                  key={`${item.tab}-${item.q}`}
                  {...fadeUp(0.03 + Math.min(i, 6) * 0.015)}
                  className={`landing-gmx-faq-grid-item${isOpen ? ' landing-gmx-faq-grid-item--open' : ''}`}
                >
                  <button
                    type="button"
                    id={buttonId}
                    className="landing-gmx-faq-q"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(item.q)}
                  >
                    <span>{item.q}</span>
                    <ChevronDown size={18} className="landing-gmx-faq-chevron" aria-hidden />
                  </button>
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    className="landing-gmx-faq-panel"
                    hidden={!isOpen}
                  >
                    <p className="landing-gmx-faq-a">{item.a}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
    </section>
  );
};

export default LandingFaqSection;
