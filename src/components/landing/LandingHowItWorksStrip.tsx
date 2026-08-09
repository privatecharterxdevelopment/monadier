import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wallet, ArrowLeftRight, CircleDollarSign, Bot, ArrowRight } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';

const STEPS = [
  { id: 'connect', Icon: Wallet },
  { id: 'bridge', Icon: ArrowLeftRight },
  { id: 'usdc', Icon: CircleDollarSign },
  { id: 'bot', Icon: Bot },
] as const;

const LandingHowItWorksStrip: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section
      className="landing-gmx-section landing-gmx-gutter landing-how-strip-section"
      aria-labelledby="landing-how-strip-title"
    >
      <div className="landing-gmx-shell landing-gmx-shell--home">
        <h2 id="landing-how-strip-title" className="landing-how-strip-title">
          {t('landing.howStrip.title')}
        </h2>
        <p className="landing-how-strip-lead">{t('landing.howStrip.lead')}</p>

        <ol className="landing-how-strip">
          {STEPS.map(({ id, Icon }, i) => (
            <li key={id} className="landing-how-strip-item">
              {i > 0 ? <span className="landing-how-strip-connector" aria-hidden /> : null}
              <div className="landing-how-strip-card">
                <span className="landing-how-strip-icon" aria-hidden>
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <span className="landing-how-strip-step">
                  {t('landing.howStrip.stepLabel', { n: i + 1 })}
                </span>
                <span className="landing-how-strip-card-title">
                  {t(`landing.howStrip.steps.${id}.title`)}
                </span>
                <span className="landing-how-strip-card-text">
                  {t(`landing.howStrip.steps.${id}.text`)}
                </span>
              </div>
            </li>
          ))}
        </ol>

        <div className="landing-how-strip-actions">
          <Link to="/how-it-works" className="landing-gmx-btn-secondary">
            {t('landing.howStrip.learnMore')}
          </Link>
          <button
            type="button"
            className="landing-gmx-btn-primary"
            onClick={() => goToOpenApp('?section=bot', false)}
          >
            {t('landing.howStrip.startApp')}
            <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
};

export default LandingHowItWorksStrip;
