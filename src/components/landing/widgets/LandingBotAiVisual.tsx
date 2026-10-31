import React from 'react';
import { useTranslation } from 'react-i18next';

const LandingBotAiVisual: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="landing-apple-bot-visual" aria-hidden>
      <div className="landing-bento-ai-orbit">
        <span className="landing-bento-ai-ring landing-bento-ai-ring--outer" />
        <span className="landing-bento-ai-ring landing-bento-ai-ring--inner" />
        <span className="landing-bento-ai-core">
          <span className="landing-bento-ai-core-glow" />
          AI
        </span>
      </div>
      <div className="landing-apple-bot-pills">
        <span>{t('landing.bento.bot.pillScan')}</span>
        <span>{t('landing.bento.bot.pillLong')}</span>
        <span>{t('landing.bento.bot.pillTrail')}</span>
      </div>
      <svg className="landing-apple-bot-spark" viewBox="0 0 240 80" preserveAspectRatio="none">
        <path
          d="M0 58 L30 52 L60 56 L90 38 L120 44 L150 28 L180 34 L210 20 L240 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

export default LandingBotAiVisual;
