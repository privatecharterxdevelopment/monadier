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

type FaqItem = { tab: string; q: string; a: string };

type Props = {
  /** Compact layout for inner marketing pages */
  variant?: 'landing' | 'page';
};

const BettingFaqSection: React.FC<Props> = ({ variant = 'page' }) => {
  const { t } = useTranslation();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const isLanding = variant === 'landing';

  const bettingFaqs = useMemo(() => {
    const items = t('landing.faq.items', { returnObjects: true });
    if (!Array.isArray(items)) return [];
    return (items as FaqItem[]).filter((item) => item.tab === 'betting');
  }, [t]);

  const faqSchema = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: bettingFaqs.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    }),
    [bettingFaqs]
  );

  return (
    <section
      className={`landing-gmx-section landing-gmx-gutter landing-betting-faq-section${isLanding ? ' landing-betting-faq-section--landing' : ''}`}
      aria-labelledby="betting-faq-title"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="landing-gmx-shell">
        <motion.h2
          {...fadeUp(0)}
          id="betting-faq-title"
          className={isLanding ? 'landing-gmx-section-hero-title' : 'landing-gmx-section-title'}
        >
          {isLanding ? (
            <>
              <span className="landing-gmx-title-dark">{t('landing.bettingFaq.titleDark')}</span>
              <span className="landing-gmx-title-grey">{t('landing.bettingFaq.titleGrey')}</span>
            </>
          ) : (
            t('landing.bettingFaq.pageTitle')
          )}
        </motion.h2>

        {isLanding ? (
          <motion.p {...fadeUp(0.03)} className="landing-betting-faq-lead">
            {t('landing.bettingFaq.lead')}
          </motion.p>
        ) : null}

        <div className="landing-betting-faq-grid">
          {bettingFaqs.map((item, i) => {
            const isOpen = openKey === item.q;
            const panelId = `betting-faq-panel-${i}`;
            const buttonId = `betting-faq-button-${i}`;

            return (
              <motion.div
                key={`${item.tab}-${item.q}`}
                {...fadeUp(0.04 + i * 0.04)}
                className={`landing-betting-faq-item${isOpen ? ' landing-betting-faq-item--open' : ''}`}
              >
                <button
                  type="button"
                  id={buttonId}
                  className="landing-betting-faq-q"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenKey((prev) => (prev === item.q ? null : item.q))}
                >
                  <span>{item.q}</span>
                  <ChevronDown size={18} className="landing-betting-faq-chevron" aria-hidden />
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="landing-betting-faq-panel"
                  hidden={!isOpen}
                >
                  <p className="landing-betting-faq-a">{item.a}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default BettingFaqSection;
