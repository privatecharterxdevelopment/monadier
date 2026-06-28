import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import LandingAppleFeatureWidget from './widgets/LandingAppleFeatureWidget';
import LandingBotCalculatorWidget from './widgets/LandingBotCalculatorWidget';
import LandingBentoMarketCharts from './widgets/LandingBentoMarketCharts';
import { useLandingScrollSequence } from './useLandingScrollSequence';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const shown = {
  initial: false as const,
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
};

const LandingHomeBentoCards: React.FC = () => {
  const { t } = useTranslation();
  const { sectionRef, locked, unlocked } = useLandingScrollSequence({
    lockId: 'bento',
    mode: 'step',
    stepCount: 1,
    releaseAnchorId: 'landing-pitch-section',
  });

  const motionProps = (delay: number) => (locked ? shown : fadeUp(delay));

  return (
    <section
      ref={sectionRef}
      className={`landing-gmx-gutter landing-home-bento-section${
        locked ? ' landing-home-bento-section--locked landing-gmx-scroll-sequence--locked' : ''
      }${unlocked ? ' landing-home-bento-section--unlocked' : ''}`}
      aria-labelledby="landing-home-bento-title"
    >
      <div className="landing-home-bento-sticky">
        <div className="landing-home-bento-container">
          <motion.header {...motionProps(0)} className="landing-home-bento-header">
            <div className="landing-home-bento-header-main">
              <h2 id="landing-home-bento-title" className="landing-home-bento-title">
                {t('landing.bento.title')}
              </h2>
            </div>
            <p className="landing-home-bento-sub">{t('landing.bento.sub')}</p>
          </motion.header>

          <div className="landing-apple-widgets-bento">
            <div className="landing-apple-widgets-stack">
              <motion.div
                {...motionProps(0.04)}
                className="landing-apple-widgets-cell landing-apple-widgets-cell--calc"
              >
                <LandingBotCalculatorWidget />
              </motion.div>

              <motion.div
                {...motionProps(0.07)}
                className="landing-apple-widgets-cell landing-apple-widgets-cell--charts"
              >
                <LandingBentoMarketCharts />
              </motion.div>
            </div>

            <motion.div
              {...motionProps(0.08)}
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
      </div>
    </section>
  );
};

export default LandingHomeBentoCards;
