import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLandingTheme } from '../../contexts/LandingThemeContext';
import {
  dashboardPreview,
  dashboardPreviewDark,
  DASHBOARD_PREVIEW_HEIGHT,
  DASHBOARD_PREVIEW_WIDTH,
} from '../../assets/landing/dashboardPreview';

type Props = {
  /** Compact hero placement (no section title above the device). */
  embedded?: boolean;
};

/**
 * MacBook Air–style device (Pacdora Starlight reference) with theme-aware dashboard.
 * Light → light dashboard screenshot; dark → dark dashboard.
 */
const LandingMacbookDashboard: React.FC<Props> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const { isLight } = useLandingTheme();
  const imgSrc = isLight ? dashboardPreview : dashboardPreviewDark;

  const device = (
    <div className="landing-mba" aria-hidden={false}>
      <div className="landing-mba-lid">
        <div className="landing-mba-bezel">
          <div className="landing-mba-notch" aria-hidden>
            <span className="landing-mba-camera" />
          </div>
          <div
            className="landing-mba-screen"
            style={{
              aspectRatio: `${DASHBOARD_PREVIEW_WIDTH} / ${DASHBOARD_PREVIEW_HEIGHT}`,
            }}
          >
            <img
              key={isLight ? 'dash-light' : 'dash-dark'}
              src={imgSrc}
              alt={t('landing.macbook.alt')}
              className="landing-mba-img"
              width={DASHBOARD_PREVIEW_WIDTH}
              height={DASHBOARD_PREVIEW_HEIGHT}
              sizes="(max-width: 900px) 94vw, 1100px"
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <motion.div
        className="landing-mba-embed"
        initial={{ opacity: 0, y: 36 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        {device}
      </motion.div>
    );
  }

  return (
    <section
      className="landing-gmx-section landing-gmx-gutter landing-macbook-section"
      aria-labelledby="landing-macbook-title"
    >
      <div className="landing-gmx-shell landing-gmx-shell--home">
        <h2 id="landing-macbook-title" className="landing-macbook-title">
          {t('landing.macbook.title')}
        </h2>
        <p className="landing-macbook-lead">{t('landing.macbook.lead')}</p>
        {device}
      </div>
    </section>
  );
};

export default LandingMacbookDashboard;
