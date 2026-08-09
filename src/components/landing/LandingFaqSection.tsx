import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const LANDING_FAQ_PREVIEW = 12;

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] },
});

type FaqItem = {
  tab: string;
  q: string;
  a: string;
};

const LandingFaqSection: React.FC = () => {
  const { t } = useTranslation();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const previewFaqs = useMemo(() => {
    const items = t('landing.faq.items', { returnObjects: true });
    const list = Array.isArray(items) ? (items as FaqItem[]) : [];
    return list.slice(0, LANDING_FAQ_PREVIEW);
  }, [t]);

  const faqSchema = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: previewFaqs.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    }),
    [previewFaqs]
  );

  const toggle = (q: string) => {
    setOpenKey((prev) => (prev === q ? null : q));
  };

  return (
    <section
      className="landing-gmx-section landing-gmx-faq-section landing-al-faq"
      aria-labelledby="landing-faq-title"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <motion.div {...fadeUp(0)} className="landing-gmx-faq-frame">
        <div className="landing-gmx-faq-head">
          <h2 id="landing-faq-title" className="landing-gmx-faq-frame-title">
            <span className="landing-gmx-title-dark">{t('landing.faq.titleDark')}</span>
            <span className="landing-gmx-title-grey">{t('landing.faq.titleGrey')}</span>
          </h2>

          <Link to="/faqs" className="landing-gmx-faq-all-link">
            {t('landing.faq.viewAll')}
            <ArrowRight size={14} strokeWidth={2.25} aria-hidden />
          </Link>
        </div>

        <div
          className="landing-gmx-faq-grid"
          role="region"
          aria-label={t('landing.faq.titleDark') + t('landing.faq.titleGrey')}
        >
          {previewFaqs.map((item, i) => {
            const isOpen = openKey === item.q;
            const panelId = `landing-faq-panel-${i}`;
            const buttonId = `landing-faq-button-${i}`;

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
