import React from 'react';
import { motion } from 'framer-motion';
import LandingAgentWalletBadges from './widgets/LandingAgentWalletBadges';
import LandingBotWalletPhoneVisual from './widgets/LandingBotWalletPhoneVisual';
import LandingBotCalculatorWidget from './widgets/LandingBotCalculatorWidget';
import {
  TRADING_BOT_RISK_BANNER,
  TRADING_BOT_WALLET_BANNER,
} from '../../lib/seo/tradingBotContent';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-72px' },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

/** Wallet + risk banners — bot page feature rows. */
const BotLandingFeatureBanners: React.FC = () => (
  <section className="landing-agent-features landing-bot-feature-banners" aria-label="Bot setup highlights">
    <div className="landing-gmx-gutter landing-gmx-shell">
      <div className="landing-agent-split-pair landing-agent-split-pair--wallet">
        <motion.article
          {...fadeUp(0)}
          className="landing-agent-split landing-agent-split--toolkit-copy landing-agent-split--panel landing-agent-split--panel-filled landing-bot-wallet-banner-copy"
        >
          <div className="landing-agent-split-copy">
            <p className="landing-agent-split-eyebrow">{TRADING_BOT_WALLET_BANNER.eyebrow}</p>
            <h2 className="landing-agent-split-title">{TRADING_BOT_WALLET_BANNER.title}</h2>
            <div className="landing-agent-split-actions">
              <LandingAgentWalletBadges />
            </div>
          </div>
        </motion.article>

        <motion.article
          {...fadeUp(0.05)}
          className="landing-agent-split landing-agent-split--panel landing-agent-split--panel-filled landing-bot-wallet-banner-phone"
        >
          <div className="landing-bot-wallet-banner-visual">
            <LandingBotWalletPhoneVisual />
          </div>
        </motion.article>
      </div>

      <motion.article
        {...fadeUp(0.08)}
        className="landing-agent-split landing-agent-split--calc landing-agent-split--reverse landing-agent-split--panel landing-agent-split--panel-filled landing-bot-feature-row landing-bot-risk-banner"
      >
        <div className="landing-agent-split-visual landing-agent-split-visual--uniform landing-agent-split-visual--box">
          <div className="landing-agent-visual-inner landing-agent-visual-inner--calc">
            <LandingBotCalculatorWidget defaultStake="50" defaultLeverage={10} />
          </div>
        </div>
        <div className="landing-agent-split-copy">
          <p className="landing-agent-split-eyebrow">{TRADING_BOT_RISK_BANNER.eyebrow}</p>
          <h2 className="landing-agent-split-title">{TRADING_BOT_RISK_BANNER.title}</h2>
          <p className="landing-agent-split-desc">{TRADING_BOT_RISK_BANNER.desc}</p>
          <div className="landing-agent-disclaimer-badge" role="note">
            <span className="landing-agent-disclaimer-badge-icon" aria-hidden>
              i
            </span>
            <span className="landing-agent-disclaimer-badge-text">
              Illustrative only — not financial advice. Leveraged crypto can lose your full stake.
            </span>
          </div>
        </div>
      </motion.article>
    </div>
  </section>
);

export default BotLandingFeatureBanners;
