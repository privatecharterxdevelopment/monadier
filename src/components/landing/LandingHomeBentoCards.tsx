import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import LandingAppleFeatureWidget from './widgets/LandingAppleFeatureWidget';
import LandingBentoMarketCharts from './widgets/LandingBentoMarketCharts';

const LandingHomeBentoCards: React.FC = () => {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 639px)');

  const fadeUp = (delay = 0) => ({
    initial: isMobile ? { opacity: 0 } : { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
  });

  return (
    <section
      className="landing-home-bento-section"
      aria-labelledby="landing-home-bento-title"
    >
      <div className="landing-gmx-gutter landing-gmx-shell">
        <div className="landing-apple-widgets-bento">
          <div className="landing-apple-widgets-stack">
            <motion.div
              {...fadeUp(0.04)}
              className="landing-apple-widgets-cell landing-apple-widgets-cell--title"
            >
              <div className="landing-bento-title-gradient-box">
                <div className="landing-bento-title-gradient-mark" aria-hidden>
                  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="32" height="32" rx="8" fill="white" fillOpacity="0.12" />
                    <path
                      d="M16 8V24M8 16H24"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div className="landing-bento-title-gradient-copy">
                  <h2 id="landing-home-bento-title" className="landing-bento-title-gradient-heading">
                    {t('landing.bento.title')}{' '}
                    <span className="landing-bento-title-gradient-muted">{t('landing.bento.titleMuted')}</span>
                  </h2>
                  <p className="landing-bento-title-gradient-sub">{t('landing.bento.sub')}</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              {...fadeUp(0.07)}
              className="landing-apple-widgets-cell landing-apple-widgets-cell--charts"
            >
              <LandingBentoMarketCharts />
            </motion.div>
          </div>

          <motion.div
            {...fadeUp(0.08)}
            className="landing-apple-widgets-cell landing-apple-widgets-cell--hero"
          >
            <LandingAppleFeatureWidget
              title={t('landing.bento.sports.title')}
              desc={t('landing.bento.sports.desc')}
              cta={t('landing.bento.sports.cta')}
              section="?section=sportsbets"
              tone="photo"
              video="/videos/sports-bento-bg.mp4"
              layout="hero"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default LandingHomeBentoCards;
