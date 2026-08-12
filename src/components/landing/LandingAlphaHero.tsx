import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import LandingMacbookDashboard from './LandingMacbookDashboard';
import LandingHeroLines from './LandingHeroLines';
import { formatLandingUserCount, getLandingUserCount } from '../../lib/landingUserCounter';

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
  const rotateLinesRaw = t('landing.hero.rotateLines', { returnObjects: true });
  const rotateLines = Array.isArray(rotateLinesRaw) && rotateLinesRaw.length > 0
    ? (rotateLinesRaw as string[])
    : [...ROTATE_FALLBACK];

  const userLabel = useMemo(() => {
    const n = getLandingUserCount();
    return `${formatLandingUserCount(n)} ${t('landing.alpha.usersLabel')}`;
  }, [t]);

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
            rotateLines={rotateLines}
            rotatePosition="two-row"
          />
        </div>

        <p className="landing-al-hero-lead">
          {t('landing.alpha.lead')}
          <br />
          {t('landing.alpha.leadSub')}
        </p>
      </motion.div>

      <LandingMacbookDashboard embedded />
    </section>
  );
};

export default LandingAlphaHero;
