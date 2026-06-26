import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { BETTING_FAQS } from '../../content/bettingFaqs';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] },
});

export type FaqTabId = 'all' | 'platform' | 'bot' | 'vault' | 'betting';

export const FAQ_TABS: { id: FaqTabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'platform', label: 'Platform' },
  { id: 'bot', label: 'Trading bot' },
  { id: 'betting', label: 'Betting' },
  { id: 'vault', label: 'Deposit & fees' },
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
    a: 'Monadier is an automated perpetuals bot on Hyperliquid. You deposit USDC on your Hyperliquid account, approve the Monadier trading agent once, and our server scans all HL markets 24/7 to open and close trades for you.',
  },
  {
    tab: 'platform',
    q: 'Is Monadier safe to use?',
    a: 'Monadier is non-custodial on Hyperliquid: your USDC stays on your HL account in your name. The trading agent can place trades but cannot withdraw without your wallet. Auto-trading runs only when you press Start bot.',
  },
  {
    tab: 'platform',
    q: 'Is Monadier non-custodial?',
    a: 'Yes. Funds sit on your Hyperliquid account, not in a Monadier vault. We never hold your private keys. Withdrawals always require your wallet signature on Hyperliquid.',
  },
  {
    tab: 'platform',
    q: 'Is Monadier fully decentralized?',
    a: 'Trading executes on Hyperliquid’s infrastructure via an agent you approve. Signal analysis and automation run on Monadier servers (Railway). You can verify balances and positions on app.hyperliquid.xyz at any time.',
  },
  {
    tab: 'platform',
    q: 'Is this financial advice?',
    a: 'No. Monadier provides software for automated Hyperliquid perpetual trading — not investment, tax, or legal advice. Crypto and leveraged trading carry significant risk. Do your own research and only use funds you can afford to lose.',
  },
  {
    tab: 'platform',
    q: 'Why Hyperliquid for automated trading?',
    a: 'Hyperliquid offers deep perp liquidity, fast execution, and USDC margin on its own L1. One deposit on HL powers trading across all listed markets — simpler than bridging through legacy L2 vaults.',
  },
  {
    tab: 'bot',
    q: 'How does the trading bot work?',
    a: 'While the bot is running, Monadier’s server (Railway) checks your HL balance every ~10 seconds, scans all Hyperliquid perps with multi-timeframe signals, opens the strongest setup, monitors take profit / stop loss, closes the position, then repeats.',
  },
  {
    tab: 'bot',
    q: 'How long does the trading bot run?',
    a: '24/7 while Start bot is on and you have at least $20 USDC on Hyperliquid. There is no session timeout — the server keeps cycling until you press Stop bot.',
  },
  {
    tab: 'bot',
    q: 'Can the bot trade 24/7?',
    a: 'Yes. Crypto markets never close. Once started, the bot scans all HL perps around the clock and can open or close positions at any hour — you do not need to stay online.',
  },
  {
    tab: 'bot',
    q: 'Can I close trades manually?',
    a: 'Yes. Open positions on Hyperliquid can be closed in the terminal or on app.hyperliquid.xyz. Stop bot halts new entries; existing HL positions remain until TP/SL or manual close.',
  },
  {
    tab: 'bot',
    q: 'Which crypto assets does the bot trade?',
    a: 'Any active Hyperliquid perpetual with a valid market signal — the bot loads the full HL universe (200+ pairs) and picks the strongest setup each cycle, not a fixed ETH/BTC list.',
  },
  {
    tab: 'bot',
    q: 'What leverage does the bot use?',
    a: 'You set leverage, take profit, and stop loss in bot settings. The bot clamps to Hyperliquid’s per-asset maximum (e.g. BTC 40×, ETH 25×) on each trade.',
  },
  {
    tab: 'bot',
    q: 'Do I need to keep my computer on?',
    a: 'No. The bot runs on Monadier servers (Railway). After Start bot and a funded Hyperliquid account, it trades 24/7 without your browser open.',
  },
  {
    tab: 'bot',
    q: 'How do I deposit so the bot can start?',
    a: 'In Monadier Funds (or app.hyperliquid.xyz): deposit only native USDC on Arbitrum One — not BNB, BSC, ETH mainnet, or USDC on other chains. Min. $5 on HL; bot needs $20+. Then approve agent → Start bot.',
  },
  {
    tab: 'vault',
    q: 'How much USDC do I need to start?',
    a: 'At least $20 USDC on your Hyperliquid account for the bot (HL minimum deposit is $5). Only fund what you want the bot to use — it trades from your HL balance, not a separate vault.',
  },
  {
    tab: 'vault',
    q: 'What fees does the bot charge?',
    a: 'Hyperliquid trading fees apply on each perp trade. Monadier may charge a builder fee on HL orders and subscription tiers for bot access. Check the app for current subscription and fee settings.',
  },
  {
    tab: 'vault',
    q: 'Can I withdraw my USDC anytime?',
    a: 'Yes — from Hyperliquid to your wallet via the Funds panel or app.hyperliquid.xyz. Close open positions first if margin is in use. The trading agent cannot withdraw for you.',
  },
  {
    tab: 'vault',
    q: 'Why Hyperliquid instead of a vault?',
    a: 'Your USDC stays on your Hyperliquid account in your name. The bot only trades via an agent you approve; it cannot move funds out. You see balance and positions directly on HL.',
  },
  {
    tab: 'vault',
    q: 'Do I need to sign wallet transactions?',
    a: 'Yes for deposits, withdrawals, and the one-time agent approval. Ongoing bot trades are signed by the approved agent — you do not sign each trade manually.',
  },
  ...BETTING_FAQS.map((item) => ({
    tab: 'betting' as const,
    q: item.q,
    a: item.a,
  })),
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
      className="landing-gmx-section landing-gmx-gutter landing-gmx-faq-section"
      aria-labelledby="landing-faq-title"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="landing-gmx-shell">
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
            Common questions about Hyperliquid deposits, 24/7 bot trading, and how Monadier
            automates your HL account.
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
