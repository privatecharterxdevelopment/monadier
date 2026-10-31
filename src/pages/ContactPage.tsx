import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CookieConsent from '../components/ui/CookieConsent';
import MarketingSeo from '../components/seo/MarketingSeo';
import LandingPageShell from '../components/landing/LandingPageShell';
import { BRAND_NAME, SUPPORT_EMAIL } from '../lib/brand';
import { useLandingTheme } from '../contexts/LandingThemeContext';

const LORENZO_LINKEDIN = 'https://www.linkedin.com/in/lorenzo-vanza-1894b1187';

/** Short contact + about: philosophy, who builds it, how to reach us. */
const ContactPage: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useLandingTheme();

  return (
    <div className={`landing-gmx landing-gmx--home landing-gmx--al landing-gmx--${theme}`}>
      <MarketingSeo path="/contact" />
      <LandingPageShell>
        <main className="landing-gmx-page-main landing-gmx-page-main--framed landing-gmx-page-main--inner landing-gmx-gutter">
          <div className="landing-gmx-shell landing-contact-shell">
            <header className="landing-contact-hero">
              <p className="landing-contact-eyebrow">{t('contact.eyebrow')}</p>
              <h1 className="landing-contact-title">{t('contact.title')}</h1>
              <p className="landing-contact-lead">{t('contact.lead')}</p>
            </header>

            <section className="landing-contact-block" aria-labelledby="contact-philosophy-title">
              <h2 id="contact-philosophy-title" className="landing-contact-h2">
                {t('contact.philosophyTitle')}
              </h2>
              <p className="landing-contact-p">{t('contact.philosophy')}</p>
            </section>

            <section className="landing-contact-block" aria-labelledby="contact-who-title">
              <h2 id="contact-who-title" className="landing-contact-h2">
                {t('contact.whoTitle')}
              </h2>
              <p className="landing-contact-p">
                {t('contact.who', { brand: BRAND_NAME })}
              </p>
              <p className="landing-contact-meta">
                <a
                  href={LORENZO_LINKEDIN}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-contact-link"
                >
                  Lorenzo Vanza · LinkedIn
                </a>
                <span aria-hidden> · </span>
                <span>{t('contact.location')}</span>
              </p>
            </section>

            <section className="landing-contact-block" aria-labelledby="contact-reach-title">
              <h2 id="contact-reach-title" className="landing-contact-h2">
                {t('contact.reachTitle')}
              </h2>
              <p className="landing-contact-p">{t('contact.reach')}</p>
              <a className="landing-contact-email" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
              <p className="landing-contact-meta">
                <Link to="/support" className="landing-contact-link">
                  {t('common.helpCenter')}
                </Link>
                <span aria-hidden> · </span>
                <Link to="/about" className="landing-contact-link">
                  {t('contact.fullAbout')}
                </Link>
              </p>
            </section>
          </div>
        </main>
      </LandingPageShell>
      <CookieConsent />
    </div>
  );
};

export default ContactPage;
