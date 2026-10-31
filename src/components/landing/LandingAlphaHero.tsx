import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import LandingMacbookDashboard from './LandingMacbookDashboard';
import LandingHeroLines from './LandingHeroLines';
import { useLandingUserCount } from '../../hooks/useLandingUserCount';

const ROTATE_FALLBACK = [
  'on Hyperliquid',
  'with automated perps',
  'across 200+ markets',
  '24/7 on your HL account',
] as const;

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

const LandingAlphaHero: React.FC = () => {
  const { t } = useTranslation();
  const { label: userCountLabel } = useLandingUserCount();
  const rotateLinesRaw = t('landing.hero.rotateLines', { returnObjects: true });
  const rotateLines =
    Array.isArray(rotateLinesRaw) && rotateLinesRaw.length > 0
      ? (rotateLinesRaw as string[])
      : [...ROTATE_FALLBACK];

  const userLabel = `${userCountLabel} ${t('landing.alpha.usersLabel')}`;

  return (
    <section className="landing-al-hero" aria-labelledby="landing-al-hero-title">
      <div className="landing-al-hero-glow" aria-hidden />

      <motion.div className="landing-al-film landing-al-users" {...fade(0)}>
        <span className="landing-al-users-dot" aria-hidden />
        {userLabel}
      </motion.div>

      <motion.div className="landing-al-hero-copy" {...fade(0.06)}>
        <h1 id="landing-al-hero-title" className="sr-only">
          {t('landing.alpha.h1')}
        </h1>
        <div className="landing-al-hero-title-wrap">
          <LandingHeroLines
            lineDarkTop={t('landing.hero.lineDarkTop')}
            lineDarkTopAccent={t('landing.hero.lineDarkTopAccent')}
            rotateLines={rotateLines}
            rotatePosition="two-row"
          />
        </div>

        <p className="landing-al-hero-lead">
          <span className="landing-al-hero-lead-line">{t('landing.alpha.lead')}</span>
          <span className="landing-al-hero-lead-line">{t('landing.alpha.leadSub')}</span>
        </p>

        <div className="landing-al-signup">
          <div className="landing-al-signup-bar">
            <p className="landing-al-hero-lead-line" style={{ padding: '1.25rem 0', maxWidth: '48ch', lineHeight: 1.6 }}>
              software sold to china.
            </p>
            <a href="/login" className="landing-al-signup-btn">
              Sign in
            </a>
          </div>
        </div>
      </motion.div>

      <LandingMacbookDashboard embedded />
    </section>
  );
};

export default LandingAlphaHero;
