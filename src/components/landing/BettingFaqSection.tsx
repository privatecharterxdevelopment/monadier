import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { BETTING_FAQS } from '../../content/bettingFaqs';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] },
});

type Props = {
  /** Compact layout for inner marketing pages */
  variant?: 'landing' | 'page';
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: BETTING_FAQS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  })),
};

const BettingFaqSection: React.FC<Props> = ({ variant = 'page' }) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const isLanding = variant === 'landing';

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
              <span className="landing-gmx-title-dark">Betting </span>
              <span className="landing-gmx-title-grey">FAQ</span>
            </>
          ) : (
            'Frequently asked questions'
          )}
        </motion.h2>

        {isLanding ? (
          <motion.p {...fadeUp(0.03)} className="landing-betting-faq-lead">
            HIP-4 outcome markets on Hyperliquid — wallet-signed, on-chain odds, and transparent
            settlement.
          </motion.p>
        ) : null}

        <div className="landing-betting-faq-grid">
          {BETTING_FAQS.map((item, i) => {
            const isOpen = openKey === item.q;
            const panelId = `betting-faq-panel-${i}`;
            const buttonId = `betting-faq-button-${i}`;

            return (
              <motion.div
                key={item.q}
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
