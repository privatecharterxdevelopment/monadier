import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LandingNav from './LandingNav';
import LandingHeroLines from './LandingHeroLines';
import LandingBotPitchSection from './LandingBotPitchSection';
import LandingProductCarouselSection from './LandingProductCarouselSection';
import LandingHomeBentoCards from './LandingHomeBentoCards';
import LandingFaqSection from './LandingFaqSection';
import LandingFooter from './LandingFooter';
import { goToOpenApp } from '../../lib/appUrls';

const LANDING_ROTATE_LINES_FALLBACK = [
  'on AI autopilot',
  'on Hyperliquid',
  'with automated perps',
  'on verified sports on-chain',
  'with hedge-fund signals',
  'with deep HL liquidity',
  'across 200+ markets',
] as const;

const GmxStyleLanding: React.FC = () => {
  const { t } = useTranslation();
  const rotateLinesRaw = t('landing.hero.rotateLines', { returnObjects: true });
  const rotateLines = Array.isArray(rotateLinesRaw)
    ? (rotateLinesRaw as string[])
    : [...LANDING_ROTATE_LINES_FALLBACK];

  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
  }, []);

  return (
    <div className="landing-gmx">
      <LandingNav variant="light" layout="gmx" />

      <section className="landing-gmx-hero landing-gmx-hero--centered landing-gmx-hero--static">
        <div className="landing-gmx-hero-static-frame">
          <div
            className={`landing-gmx-hero-video-wrap${videoReady ? ' landing-gmx-hero-video-wrap--ready' : ''}`}
            aria-hidden
          >
            <video
              className="landing-gmx-hero-video"
              src="/videos/hero-bg.mp4"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              onLoadedData={() => setVideoReady(true)}
            />
          </div>

          <div className="landing-gmx-hero-chrome landing-gmx-hero-chrome--static">
            <div className="landing-gmx-hero-chrome-spacer" aria-hidden />
            <div className="landing-gmx-hero-chrome-title">
              <LandingHeroLines
                lineDarkTop={t('landing.hero.lineDarkTop')}
                rotateLines={rotateLines}
                rotatePosition="two-row"
              />
            </div>
            <div className="landing-gmx-hero-cta-slot">
              <div
                className="landing-gmx-hero-fs-cta landing-gmx-hero-fs-cta--static"
                role="group"
                aria-label={t('common.getStarted')}
              >
                <button
                  type="button"
                  className="landing-gmx-hero-fs-btn landing-gmx-hero-fs-btn--light"
                  onClick={() => goToOpenApp('', false)}
                >
                  {t('common.openApp')}
                  <ArrowRight size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="landing-gmx-hero-fs-btn landing-gmx-hero-fs-btn--dark"
                  onClick={() => goToOpenApp('?section=bot', false)}
                >
                  {t('common.startBot')}
                  <ArrowRight size={16} aria-hidden />
                </button>
              </div>
            </div>
            <p className="landing-gmx-hero-disclaimer landing-gmx-hero-disclaimer--static">
              {t('landing.hero.disclaimer')}
            </p>
          </div>
        </div>
      </section>

      <LandingProductCarouselSection />
      <LandingHomeBentoCards />
      <LandingBotPitchSection />
      <LandingFaqSection />
      <LandingFooter />
    </div>
  );
};

export default GmxStyleLanding;
