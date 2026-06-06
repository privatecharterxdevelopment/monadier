import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] },
});

export type FaqTabId = 'all' | 'platform' | 'bot' | 'vault';

export const FAQ_TABS: { id: FaqTabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'platform', label: 'Platform' },
  { id: 'bot', label: 'Trading bot' },
  { id: 'vault', label: 'Vault & fees' },
];

/** Keyword-rich FAQs — tabbed accordion; FAQPage schema for Google */
export const LANDING_FAQS: {
  q: string;
  a: string;
  tab: Exclude<FaqTabId, 'all'>;
}[] = [
  {
    tab: 'platform',
    q: 'What is Monadier?',
    a: 'Monadier is an automated GMX perpetuals trading bot on Arbitrum. You deposit USDC into a non-custodial vault smart contract; the bot scans ETH, BTC, and ARB signals and executes leveraged trades through GMX liquidity pools.',
  },
  {
    tab: 'platform',
    q: 'Is Monadier safe to use?',
    a: 'Monadier is non-custodial: your USDC stays in the on-chain V11 vault and only your wallet can deposit or withdraw. Auto-trading runs only when you turn it on. Smart contracts carry inherent DeFi risk — never deposit more than you can afford to lose.',
  },
  {
    tab: 'platform',
    q: 'Is Monadier non-custodial?',
    a: 'Yes. Funds sit in the Monadier V11 vault on Arbitrum. We never hold your private keys or move USDC without your wallet signature. Auto-trading executes only when you explicitly enable it in bot settings.',
  },
  {
    tab: 'platform',
    q: 'Is Monadier fully decentralized?',
    a: 'Monadier is a non-custodial interface to on-chain infrastructure on Arbitrum. Deposits, withdrawals, and every GMX trade the bot places settle on-chain and are publicly verifiable in any Arbitrum block explorer. We cannot access your wallet or vault without your signature.',
  },
  {
    tab: 'platform',
    q: 'Is this financial advice?',
    a: 'No. Monadier provides software for automated GMX perpetual trading — not investment, tax, or legal advice. Crypto and leveraged trading carry significant risk. Do your own research and only use funds you can afford to lose.',
  },
  {
    tab: 'platform',
    q: 'Why Arbitrum and GMX for automated trading?',
    a: 'Arbitrum offers low fees and fast settlement. GMX provides deep on-chain perpetual liquidity, oracle pricing, and high leverage — ideal for an algorithmic crypto trading bot with transparent on-chain execution.',
  },
  {
    tab: 'bot',
    q: 'How does the GMX trading bot work?',
    a: 'The bot runs on Arbitrum with multi-timeframe analysis (1m–1h), risk gates, then GMX perp execution from your vault. You set take profit, stop loss, and leverage — trades open and close automatically while the bot is enabled.',
  },
  {
    tab: 'bot',
    q: 'How long does the trading bot run?',
    a: 'The bot runs continuously on our servers while it is enabled and your vault has sufficient USDC. There is no session timeout — it keeps scanning markets and executing GMX trades until you press Stop bot or your balance is too low to trade.',
  },
  {
    tab: 'bot',
    q: 'Can the bot trade 24/7?',
    a: 'Yes. Crypto markets never close. Once auto-trading is on, the Monadier bot monitors ETH, BTC, and ARB around the clock and can open or close GMX perpetual positions at any hour — you do not need to stay online.',
  },
  {
    tab: 'bot',
    q: 'Can I close trades manually?',
    a: 'Yes. Open the trade panel and tap Close position to queue an exit on the next bot cycle. You can also Stop bot to halt new entries and close open positions. Withdrawals are available once no active trade is locking vault funds.',
  },
  {
    tab: 'bot',
    q: 'Which crypto assets does the bot trade?',
    a: 'On Arbitrum the bot trades GMX perpetuals for WETH (ETH), WBTC (BTC), and ARB. Live charts and signals cover all three pairs so the bot can pick the strongest setup.',
  },
  {
    tab: 'bot',
    q: 'What leverage does the bot use on GMX?',
    a: 'You configure leverage, take profit, and stop loss in bot settings before starting. The bot respects your risk limits on each GMX perpetual trade — up to the maximum allowed by GMX for each market.',
  },
  {
    tab: 'bot',
    q: 'Do I need to keep my computer on?',
    a: 'No. The Monadier auto-trading bot runs in the cloud. After you enable it and fund your vault, execution continues 24/7 without your browser or PC staying open.',
  },
  {
    tab: 'vault',
    q: 'How much USDC do I need to start?',
    a: 'Minimum vault deposit is $50 USDC on Arbitrum. You also need a small amount of ETH on Arbitrum for gas. There is no platform deposit fee — a win fee applies only on profitable closed trades.',
  },
  {
    tab: 'vault',
    q: 'What fees does the GMX trading bot charge?',
    a: 'No deposit fee. Monadier charges a performance-based win fee on profitable closed trades only — losing trades are not charged. Standard Arbitrum gas and GMX trading fees still apply on-chain.',
  },
  {
    tab: 'vault',
    q: 'Can I withdraw my USDC anytime?',
    a: 'Yes, when funds are not locked in an open GMX position. Connect your wallet, switch to Arbitrum, and withdraw from the vault. If a trade is open, close it first or wait for the bot to exit before withdrawing.',
  },
  {
    tab: 'vault',
    q: 'Why use a vault instead of giving the bot my whole wallet?',
    a: 'The vault caps how much USDC the bot can trade. You fund only what you want at risk, keep the rest in your wallet, and can verify vault balance and every bot trade on Arbitrum at any time — full transparency over your trading capital.',
  },
  {
    tab: 'vault',
    q: 'Do I need to sign wallet transactions?',
    a: 'Yes. Every deposit and withdrawal between your wallet and the Monadier vault requires your wallet signature on Arbitrum. Monadier cannot pull USDC from your wallet or send it elsewhere without your explicit approval.',
  },
];

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
  const [activeTab, setActiveTab] = useState<FaqTabId>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const visibleFaqs =
    activeTab === 'all'
      ? LANDING_FAQS
      : LANDING_FAQS.filter((item) => item.tab === activeTab);

  const toggle = (q: string) => {
    setOpenKey((prev) => (prev === q ? null : q));
  };

  const selectTab = (tab: FaqTabId) => {
    setActiveTab(tab);
    setOpenKey(null);
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
        <motion.h2
          {...fadeUp(0)}
          id="landing-faq-title"
          className="landing-gmx-section-hero-title"
        >
          <span className="landing-gmx-title-dark">Frequently asked </span>
          <span className="landing-gmx-title-grey">questions</span>
        </motion.h2>

        <div className="landing-gmx-faq-layout">
        <motion.aside {...fadeUp(0.04)} className="landing-gmx-faq-side">
          <p className="landing-gmx-faq-lead">
            Common questions about safety, 24/7 trading, manual closes, and our GMX crypto bot on
            Arbitrum.
          </p>
          <div className="landing-gmx-faq-tabs" role="tablist">
            {FAQ_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`landing-gmx-faq-tab${activeTab === tab.id ? ' landing-gmx-faq-tab--active' : ''}`}
                onClick={() => selectTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </motion.aside>

        <div
          className="landing-gmx-faq-main"
          role="tabpanel"
          aria-label={`${FAQ_TABS.find((t) => t.id === activeTab)?.label} questions`}
        >
          <div className="landing-gmx-faq-grid">
            {visibleFaqs.map((item, i) => {
              const isOpen = openKey === item.q;
              const panelId = `landing-faq-panel-${activeTab}-${i}`;
              const buttonId = `landing-faq-button-${activeTab}-${i}`;

              return (
                <motion.div
                  key={item.q}
                  {...fadeUp(0.03 + Math.min(i, 6) * 0.015)}
                  className={`landing-gmx-faq-grid-item${isOpen ? ' landing-gmx-faq-grid-item--open' : ''}`}
                >
                  <button
                    type="button"
                    id={buttonId}
                    className="landing-gmx-faq-q"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(item.q)}
                  >
                    <span>{item.q}</span>
                    <ChevronDown size={18} className="landing-gmx-faq-chevron" aria-hidden />
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
        </div>
      </div>
    </section>
  );
};

export default LandingFaqSection;
