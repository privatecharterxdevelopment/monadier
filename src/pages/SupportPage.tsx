import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MarketingInnerPage, {
  MarketingPageHero,
} from '../components/marketing/MarketingInnerPage';
import MarketingFaqAccordion from '../components/marketing/MarketingFaqAccordion';
import { pickSupportFaqs, type LandingFaqItem } from '../lib/supportFaq';
import { SUPPORT_EMAIL } from '../lib/brand';

const SupportPage: React.FC = () => {
  const { t } = useTranslation();

  const faqs = useMemo(() => {
    const items = t('landing.faq.items', { returnObjects: true });
    const landing = Array.isArray(items) ? (items as LandingFaqItem[]) : [];
    const basics = pickSupportFaqs(landing);
    const extraQ = t('marketing.support.faqExtra.q');
    const extraA = t('marketing.support.faqExtra.a');
    if (extraQ && extraA && extraQ !== 'marketing.support.faqExtra.q') {
      return [...basics, { tab: 'platform', q: extraQ, a: extraA }];
    }
    return basics;
  }, [t]);

  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow={t('marketing.support.eyebrow')}
        title={t('marketing.support.title')}
        lead={t('marketing.support.lead')}
        sub={t('marketing.support.sub')}
      />

      <article className="mkt-card mkt-support-contact-card landing-glass-card">
        <div className="mkt-card-body mkt-support-contact-body">
          <div className="mkt-support-contact-row">
            <div className="mkt-support-contact-item">
              <div className="mkt-card-icon" aria-hidden>
                <Mail size={20} strokeWidth={1.75} />
              </div>
              <div className="mkt-support-contact-copy">
                <h2 className="mkt-card-title">{t('marketing.support.contactEmailTitle')}</h2>
                <p className="mkt-card-text">{t('marketing.support.contactEmailText')}</p>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="mkt-cta-primary">
                  {t('marketing.support.contactEmailCta')}
                </a>
              </div>
            </div>

            <div className="mkt-support-contact-divider" aria-hidden />

            <div className="mkt-support-contact-item">
              <div className="mkt-card-icon" aria-hidden>
                <Clock size={20} strokeWidth={1.75} />
              </div>
              <div className="mkt-support-contact-copy">
                <h2 className="mkt-card-title">{t('marketing.support.contactHoursTitle')}</h2>
                <p className="mkt-card-text">{t('marketing.support.contactHoursText')}</p>
              </div>
            </div>
          </div>
        </div>
      </article>

      <div className="mkt-support-faq-head">
        <h2 className="mkt-support-faq-title">{t('footer.faqs')}</h2>
        <Link to="/faqs" className="landing-gmx-faq-all-link">
          {t('landing.faq.viewAll')}
        </Link>
      </div>
      <MarketingFaqAccordion items={faqs} idPrefix="support-faq" />
    </MarketingInnerPage>
  );
};

export default SupportPage;
