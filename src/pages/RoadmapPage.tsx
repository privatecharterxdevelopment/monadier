import React from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Building2,
  Factory,
  LineChart,
  ShieldCheck,
  Mail,
  Gift,
  Trophy,
} from 'lucide-react';
import MarketingInnerPage, {
  MarketingPageHero,
} from '../components/marketing/MarketingInnerPage';
import { ROADMAP_CARD_VISUALS } from '../components/marketing/MarketingIllustrations';

const ROADMAP = [
  {
    status: 'active' as const,
    icon: Bot,
    title: 'Trading bot development',
    milestone: 'Now',
    text: 'Continuous work on signal quality, Hyperliquid execution, risk gates, and the dashboard terminal — the core product you use today.',
  },
  {
    status: 'upcoming' as const,
    icon: Building2,
    title: 'Company incorporation',
    milestone: '100 registered users',
    text: 'Formal company setup in Switzerland once we reach 100 users — clearer contracts, invoicing, and long-term operations.',
  },
  {
    status: 'upcoming' as const,
    icon: Factory,
    title: 'Isolated vault factory',
    milestone: '250 registered users',
    text: 'Deploy isolated vault instances per user cohort via a vault factory — stronger separation and scalable on-chain architecture.',
  },
  {
    status: 'upcoming' as const,
    icon: Gift,
    title: 'Referral links & USDC rewards',
    milestone: '250 registered users',
    text: 'Personal referral links go live — invite traders and earn USDC rewards when referred users fund and trade through HyperGain.',
  },
  {
    status: 'upcoming' as const,
    icon: LineChart,
    title: 'More charts, more trades',
    milestone: 'Ongoing',
    text: 'Expand chart tooling and timeframes so analysis depth matches live execution — more context per trade decision.',
  },
  {
    status: 'upcoming' as const,
    icon: ShieldCheck,
    title: 'CertiK smart contract audit',
    milestone: '500 active users',
    text: 'Third-party audit of the HyperGain vault smart contracts by CertiK before scaling to a larger active user base.',
  },
  {
    status: 'upcoming' as const,
    icon: Trophy,
    title: 'Prize pool activation',
    milestone: '500 active users',
    text: 'Community prize pool goes live — performance-based USDC rewards for active traders once we reach 500 active users.',
  },
  {
    status: 'upcoming' as const,
    icon: Mail,
    title: 'Extended customer support',
    milestone: 'Planned',
    text: 'Broader support channels as we grow. Today support is email only — no Discord, no Telegram, no official social DMs.',
  },
] as const;

const RoadmapPage: React.FC = () => {
  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow="Product"
        title="HyperGain roadmap"
        lead="What we are building next — tied to real user milestones and operational maturity."
        sub="Timelines shift with market conditions and user growth; order reflects current intent."
      />

      <ol className="mkt-roadmap-flow">
        {ROADMAP.map((item, index) => {
          const Icon = item.icon;
          const step = index + 1;
          const isLast = index === ROADMAP.length - 1;
          const isActive = item.status === 'active';

          return (
            <li
              key={item.title}
              className={`mkt-roadmap-step${isActive ? ' mkt-roadmap-step--active' : ''}`}
            >
              <div className="mkt-roadmap-rail" aria-hidden>
                <span className="mkt-roadmap-step-badge">{step}</span>
                {!isLast && <span className="mkt-roadmap-connector" />}
              </div>
              <article className="mkt-roadmap-step-card landing-glass-card">
                <div className="mkt-roadmap-step-visual">
                  {(() => {
                    const Visual = ROADMAP_CARD_VISUALS[index];
                    return Visual ? <Visual /> : null;
                  })()}
                </div>
                <div className="mkt-roadmap-step-content">
                  <div className="mkt-roadmap-step-head">
                    <span className="mkt-roadmap-step-label">
                      Step {step}
                      {isActive ? ' · In progress' : ''}
                    </span>
                    <div className="mkt-roadmap-icon" aria-hidden>
                      <Icon size={20} strokeWidth={1.75} />
                    </div>
                  </div>
                  <span className="mkt-roadmap-milestone">{item.milestone}</span>
                  <h2 className="mkt-roadmap-title">{item.title}</h2>
                  <p className="mkt-roadmap-text">{item.text}</p>
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      <div className="mkt-roadmap-warning landing-glass-card">
        <h2 className="mkt-roadmap-warning-title">Support &amp; scams</h2>
        <p>
          HyperGain customer support is <strong>email only</strong>. We do not offer Discord,
          Telegram, or social-media support channels. Accounts on X, Instagram, Facebook, or
          elsewhere claiming to be HyperGain are <strong>most likely scams</strong> — never send
          funds or seed phrases to anyone contacting you there.
        </p>
        <p>
          For help, use the contact form on our{' '}
          <Link to="/support">Support page</Link> or the email listed in the app.
        </p>
      </div>
    </MarketingInnerPage>
  );
};

export default RoadmapPage;
