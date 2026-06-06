import React from 'react';
import { Mail, Clock, HelpCircle } from 'lucide-react';
import MarketingInnerPage, {
  MarketingPageHero,
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingSectionHeading,
  MarketingPageCta,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';

const faqs = [
  {
    question: 'How do I get started?',
    answer:
      'Create an account, connect your wallet on Arbitrum, deposit USDC into your vault, configure bot settings, and enable auto-trading. See How it works for the full walkthrough.',
  },
  {
    question: 'Is my wallet safe?',
    answer:
      'Monadier is non-custodial. Your USDC is held in the on-chain vault; only your connected wallet can deposit or withdraw. We never access your private keys.',
  },
  {
    question: 'Which network and exchange?',
    answer:
      'Trading runs on Arbitrum One via GMX perpetuals for ETH, BTC, and ARB. You need USDC in the vault and a small amount of ETH on Arbitrum for gas.',
  },
  {
    question: 'Can I stop the bot or close trades?',
    answer:
      'Yes. Use Stop bot in the trade panel to halt new entries. Close position queues an exit on the next cycle. Withdraw when no active trade locks vault funds.',
  },
  {
    question: 'What fees apply?',
    answer:
      'No platform subscription fee. A success fee applies on profitable closed trades only. Standard GMX and Arbitrum gas costs still apply on-chain.',
  },
  {
    question: 'How fast is support?',
    answer:
      'Email support@monadier.com — we aim to reply within 24 hours, Monday–Sunday 09:00–20:00 CET.',
  },
];

const SupportPage: React.FC = () => {
  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow="Support"
        title="Help & contact"
        lead="Questions about your vault, the GMX bot, or your account? Reach out or browse common answers below."
        sub="For urgent trading issues, include your wallet address and a screenshot from the dashboard."
      />

      <MarketingPageGrid columns={2}>
        <article className="mkt-card">
          <div className="mkt-card-icon" aria-hidden>
            <Mail size={20} strokeWidth={1.75} />
          </div>
          <h2 className="mkt-card-title">Email support</h2>
          <p className="mkt-card-text">
            Send us a message and we will get back to you within 24 hours.
          </p>
          <a href="mailto:support@monadier.com" className="mkt-cta-primary">
            support@monadier.com
          </a>
        </article>

        <article className="mkt-card">
          <div className="mkt-card-icon" aria-hidden>
            <Clock size={20} strokeWidth={1.75} />
          </div>
          <h2 className="mkt-card-title">Support hours</h2>
          <p className="mkt-card-text">
            Monday – Sunday, 09:00 – 20:00 CET. The trading bot itself runs 24/7 on our infrastructure.
          </p>
        </article>
      </MarketingPageGrid>

      <MarketingSectionHeading
        title="Frequently asked questions"
        sub="Quick answers about setup, safety, and fees."
      />

      <MarketingPageGrid columns={2}>
        {faqs.map((faq) => (
          <MarketingFeatureCard
            key={faq.question}
            title={faq.question}
            text={faq.answer}
            icon={HelpCircle}
          />
        ))}
      </MarketingPageGrid>

      <MarketingPageCta
        href="mailto:support@monadier.com"
        label="Contact support"
        secondary={{ to: '/how-it-works', label: 'How it works' }}
      />

      <MarketingDisclaimer>
        For account security, never share your seed phrase or private keys with anyone — including support.
      </MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default SupportPage;
