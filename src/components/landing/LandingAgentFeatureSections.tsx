import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import LandingBotCalculatorWidget from './widgets/LandingBotCalculatorWidget';
import LandingBotAnalysisCarousel from './widgets/LandingBotAnalysisCarousel';
import LandingAgentWalletFoxVisual from './widgets/LandingAgentWalletFoxVisual';
import LandingAgentWalletBadges from './widgets/LandingAgentWalletBadges';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-72px' },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

/** Three left/right feature rows after the sleep-earnings AI agent section. */
const LandingAgentFeatureSections: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section
      className="landing-agent-features"
      aria-labelledby="landing-agent-features-heading"
    >
      <div className="landing-gmx-gutter landing-gmx-shell">
        <h2 id="landing-agent-features-heading" className="landing-agent-features-sr">
          {t('landing.agentSections.aria')}
        </h2>

        <motion.article
          {...fadeUp(0)}
          className="landing-agent-split landing-agent-split--calc landing-agent-split--panel landing-agent-split--panel-filled"
        >
          <div className="landing-agent-split-visual landing-agent-split-visual--uniform landing-agent-split-visual--box">
            <div className="landing-agent-visual-inner landing-agent-visual-inner--calc">
              <LandingBotCalculatorWidget defaultStake="50" defaultLeverage={16} />
            </div>
          </div>
          <div className="landing-agent-split-copy">
            <p className="landing-agent-split-eyebrow">{t('landing.agentSections.calc.eyebrow')}</p>
            <h3 className="landing-agent-split-title">{t('landing.agentSections.calc.title')}</h3>
            <p className="landing-agent-split-desc">{t('landing.agentSections.calc.desc')}</p>
            <div className="landing-agent-disclaimer-badge" role="note">
              <span className="landing-agent-disclaimer-badge-icon" aria-hidden>
                i
              </span>
              <span className="landing-agent-disclaimer-badge-text">
                {t('landing.widgets.calc.footnote')}
              </span>
            </div>
          </div>
        </motion.article>

        <div className="landing-agent-split-pair landing-agent-split-pair--toolkit">
          <motion.article
            {...fadeUp(0.06)}
            className="landing-agent-split landing-agent-split--toolkit-copy landing-agent-split--panel landing-agent-split--panel-filled"
          >
            <div className="landing-agent-split-copy">
              <p className="landing-agent-split-eyebrow">{t('landing.agentSections.toolkit.eyebrow')}</p>
              <h3 className="landing-agent-split-title">{t('landing.agentSections.toolkit.title')}</h3>
              <p className="landing-agent-split-desc">{t('landing.agentSections.toolkit.desc')}</p>
            </div>
          </motion.article>

          <motion.article
            {...fadeUp(0.08)}
            className="landing-agent-split landing-agent-split--toolkit-visual landing-agent-split--panel landing-agent-split--panel-filled"
          >
            <div className="landing-agent-split-visual landing-agent-split-visual--uniform landing-agent-split-visual--box landing-agent-split-visual--analyzer">
              <LandingBotAnalysisCarousel />
            </div>
          </motion.article>
        </div>

        <motion.article
          {...fadeUp(0.1)}
          className="landing-agent-split landing-agent-split--winrate landing-agent-split--panel landing-agent-split--panel-filled"
        >
          <div className="landing-agent-split-visual landing-agent-split-visual--uniform landing-agent-split-visual--box">
            <div className="landing-agent-visual-inner landing-agent-visual-inner--wallets">
              <LandingAgentWalletFoxVisual />
            </div>
          </div>
          <div className="landing-agent-split-copy">
            <p className="landing-agent-split-eyebrow">{t('landing.agentSections.winrate.eyebrow')}</p>
            <h3 className="landing-agent-split-title">{t('landing.agentSections.winrate.title')}</h3>
            <p className="landing-agent-split-desc">{t('landing.agentSections.winrate.desc')}</p>
            <div className="landing-agent-split-actions">
              <LandingAgentWalletBadges />
            </div>
          </div>
        </motion.article>
      </div>
    </section>
  );
};

export default LandingAgentFeatureSections;
