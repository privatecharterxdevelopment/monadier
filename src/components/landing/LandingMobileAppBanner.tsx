import React from 'react';
import { ArrowRight, Smartphone } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';
import { dashboardPreview } from '../../assets/landing/dashboardPreview';

const LandingMobileAppBanner: React.FC = () => (
  <section
    className="landing-gmx-section landing-gmx-gutter landing-gmx-mobile-banner-section"
    aria-labelledby="landing-mobile-app-title"
  >
    <div className="landing-gmx-mobile-banner-shell">
      <div className="landing-gmx-mobile-banner landing-glass-card">
        <div className="landing-gmx-mobile-banner-copy">
          <p className="landing-gmx-mobile-banner-eyebrow">
            <Smartphone size={14} aria-hidden />
            Mobile app
          </p>
          <h2 id="landing-mobile-app-title" className="landing-gmx-mobile-banner-title">
            Trade from your pocket
          </h2>
          <p className="landing-gmx-mobile-banner-desc">
            Full Hyperliquid terminal on iOS and Android — perps, bot controls, and live
            charts wherever you are.
          </p>
          <button
            type="button"
            className="landing-gmx-mobile-banner-cta"
            onClick={() => goToOpenApp('', false)}
          >
            Open mobile app
            <ArrowRight size={16} aria-hidden />
          </button>
        </div>

        <div className="landing-gmx-mobile-banner-phone-wrap" aria-hidden>
          <div className="landing-gmx-mobile-banner-phone">
            <div className="landing-gmx-mobile-banner-phone-notch" />
            <div className="landing-gmx-mobile-banner-phone-screen">
              <img
                src={dashboardPreview}
                alt=""
                className="landing-gmx-mobile-banner-phone-img"
                width={2872}
                height={1386}
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default LandingMobileAppBanner;
