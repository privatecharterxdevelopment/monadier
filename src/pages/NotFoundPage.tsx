import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import LandingPageShell from '../components/landing/LandingPageShell';
import { useLandingTheme } from '../contexts/LandingThemeContext';
import { SITE_NAME } from '../lib/seo/site';

const NotFoundPage: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useLandingTheme();

  return (
    <div className={`landing-gmx landing-gmx--home landing-gmx--al landing-gmx--${theme}`}>
      <Helmet>
        <title>{t('notFound.title')} | {SITE_NAME}</title>
        <meta name="robots" content="noindex, follow" />
        <meta name="googlebot" content="noindex, follow" />
      </Helmet>
      <LandingPageShell>
        <main className="landing-gmx-page-main landing-gmx-page-main--framed landing-gmx-page-main--inner landing-gmx-gutter">
          <div className="landing-gmx-shell landing-contact-shell">
            <header className="landing-contact-hero">
              <p className="landing-contact-eyebrow">404</p>
              <h1 className="landing-contact-title">{t('notFound.heading')}</h1>
              <p className="landing-contact-lead">{t('notFound.lead')}</p>
            </header>
            <nav className="landing-contact-block" aria-label={t('notFound.navLabel')}>
              <p className="landing-contact-meta">
                <Link to="/" className="landing-contact-link">
                  {t('notFound.home')}
                </Link>
                <span aria-hidden> · </span>
                <Link to="/trading-bot" className="landing-contact-link">
                  {t('nav.aiTradingBot')}
                </Link>
                <span aria-hidden> · </span>
                <Link to="/how-it-works" className="landing-contact-link">
                  {t('common.howItWorks')}
                </Link>
                <span aria-hidden> · </span>
                <Link to="/support" className="landing-contact-link">
                  {t('common.helpCenter')}
                </Link>
              </p>
            </nav>
          </div>
        </main>
      </LandingPageShell>
    </div>
  );
};

export default NotFoundPage;
