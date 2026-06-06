import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] },
});

/** Keyword-rich FAQs — accordion UI; full text in DOM + FAQPage schema for Google */
export const LANDING_FAQS = [
  {
    q: 'What is Monadier?',
    a: 'Monadier is an automated GMX perpetuals trading bot on Arbitrum. You deposit USDC into a non-custodial vault smart contract; the bot scans ETH, BTC, and ARB signals and executes leveraged trades through GMX liquidity pools.',
  },
  {
    q: 'How does the GMX trading bot work?',
    a: 'The bot runs on Arbitrum with multi-timeframe analysis (1m–1h), risk gates, then GMX perp execution from your vault. You set take profit, stop loss, and leverage — trades open and close automatically while the bot is enabled.',
  },
  {
    q: 'Is Monadier safe to use?',
    a: 'Monadier is non-custodial: your USDC stays in the on-chain V11 vault and only your wallet can deposit or withdraw. Auto-trading runs only when you turn it on. Smart contracts carry inherent DeFi risk — never deposit more than you can afford to lose.',
  },
  {
    q: 'Is Monadier non-custodial?',
    a: 'Yes. Funds sit in the Monadier V11 vault on Arbitrum. We never hold your private keys or move USDC without your wallet signature. Auto-trading executes only when you explicitly enable it in bot settings.',
  },
  {
    q: 'How long does the trading bot run?',
    a: 'The bot runs continuously on our servers while it is enabled and your vault has sufficient USDC. There is no session timeout — it keeps scanning markets and executing GMX trades until you press Stop bot or your balance is too low to trade.',
  },
  {
    q: 'Can the bot trade 24/7?',
    a: 'Yes. Crypto markets never close. Once auto-trading is on, the Monadier bot monitors ETH, BTC, and ARB around the clock and can open or close GMX perpetual positions at any hour — you do not need to stay online.',
  },
  {
    q: 'Can I close trades manually?',
    a: 'Yes. Open the trade panel and tap Close position to queue an exit on the next bot cycle. You can also Stop bot to halt new entries and close open positions. Withdrawals are available once no active trade is locking vault funds.',
  },
  {
    q: 'Which crypto assets does the bot trade?',
    a: 'On Arbitrum the bot trades GMX perpetuals for WETH (ETH), WBTC (BTC), and ARB. Live charts and signals cover all three pairs so the bot can pick the strongest setup.',
  },
  {
    q: 'How much USDC do I need to start?',
    a: 'Minimum vault deposit is $50 USDC on Arbitrum. You also need a small amount of ETH on Arbitrum for gas. There is no platform deposit fee — a win fee applies only on profitable closed trades.',
  },
  {
    q: 'What fees does the GMX trading bot charge?',
    a: 'No deposit fee. Monadier charges a performance-based win fee on profitable closed trades only — losing trades are not charged. Standard Arbitrum gas and GMX trading fees still apply on-chain.',
  },
  {
    q: 'Can I withdraw my USDC anytime?',
    a: 'Yes, when funds are not locked in an open GMX position. Connect your wallet, switch to Arbitrum, and withdraw from the vault. If a trade is open, close it first or wait for the bot to exit before withdrawing.',
  },
  {
    q: 'Do I need to keep my computer on?',
    a: 'No. The Monadier auto-trading bot runs in the cloud. After you enable it and fund your vault, execution continues 24/7 without your browser or PC staying open.',
  },
  {
    q: 'What leverage does the bot use on GMX?',
    a: 'You configure leverage, take profit, and stop loss in bot settings before starting. The bot respects your risk limits on each GMX perpetual trade — up to the maximum allowed by GMX for each market.',
  },
  {
    q: 'Why Arbitrum and GMX for automated trading?',
    a: 'Arbitrum offers low fees and fast settlement. GMX provides deep on-chain perpetual liquidity, oracle pricing, and high leverage — ideal for an algorithmic crypto trading bot with transparent on-chain execution.',
  },
] as const;

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: LANDING_FAQS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  })),
};

const LandingFaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section
      className="landing-gmx-section landing-gmx-faq-section"
      aria-labelledby="landing-faq-title"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="landing-gmx-container">
        <motion.div {...fadeUp(0)} className="landing-gmx-faq-head">
          <p className="landing-gmx-preview-eyebrow">FAQ</p>
          <h2 id="landing-faq-title" className="landing-gmx-faq-title">
            GMX automated trading on Arbitrum
          </h2>
          <p className="landing-gmx-faq-sub">
            Common questions about safety, 24/7 trading, manual closes, and our crypto bot.
          </p>
        </motion.div>
        <div className="landing-gmx-faq-list">
          {LANDING_FAQS.map((item, i) => {
            const isOpen = openIndex === i;
            const panelId = `landing-faq-panel-${i}`;
            const buttonId = `landing-faq-button-${i}`;

            return (
              <motion.div
                key={item.q}
                {...fadeUp(0.02 + i * 0.015)}
                className={`landing-gmx-faq-item${isOpen ? ' landing-gmx-faq-item--open' : ''}`}
              >
                <button
                  type="button"
                  id={buttonId}
                  className="landing-gmx-faq-q"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(i)}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    size={18}
                    className="landing-gmx-faq-chevron"
                    aria-hidden
                  />
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="landing-gmx-faq-panel"
                  hidden={!isOpen}
                >
                  <p className="landing-gmx-faq-a">{item.a}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default LandingFaqSection;
