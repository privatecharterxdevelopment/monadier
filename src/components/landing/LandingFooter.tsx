import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LandingLegalDisclaimers from './LandingLegalDisclaimers';
import OfficialXLink from './OfficialXLink';
import { LANDING_FOOTER_LINKS } from '../../lib/landingNavLinks';

type Props = {
  /** Outside the rounded page frame (AlphaLedger / Panther shell). */
  variant?: 'default' | 'outer';
};

const LandingFooter: React.FC<Props> = ({ variant = 'default' }) => {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  const outer = variant === 'outer';

  return (
    <footer
      className={`landing-gmx-footer landing-gmx-gutter${outer ? ' landing-al-outer-footer' : ''}`}
      role="contentinfo"
    >
      <div className="landing-gmx-shell landing-gmx-footer-inner">
        <nav className="landing-gmx-footer-links" aria-label="Site">
          {LANDING_FOOTER_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {t(link.labelKey)}
            </Link>
          ))}
          <OfficialXLink variant="label" className="landing-gmx-footer-x" />
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
