import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LandingLegalDisclaimers from './LandingLegalDisclaimers';
import { LANDING_FOOTER_LINKS } from '../../lib/landingNavLinks';

const LandingFooter: React.FC = () => {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="landing-gmx-footer landing-gmx-gutter" role="contentinfo">
      <div className="landing-gmx-shell landing-gmx-footer-inner">
        <nav className="landing-gmx-footer-links" aria-label="Site">
          {LANDING_FOOTER_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {t(link.labelKey)}
            </Link>
          ))}
        </nav>

        <LandingLegalDisclaimers />

        <p className="landing-gmx-footer-meta">
          {t('footer.copyright', { year })}
        </p>
      </div>
    </footer>
  );
};

export default LandingFooter;
