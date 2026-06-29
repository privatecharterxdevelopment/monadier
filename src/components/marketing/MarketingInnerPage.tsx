import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import MarketingPageLayout from '../layout/MarketingPageLayout';
import OpenAppLink from '../layout/OpenAppLink';

const ARBITRUM_LOGO = '/images/partners/arbitrum.svg';
const USDC_LOGO = '/images/partners/usdc.svg';

type HeroProps = {
  eyebrow?: string;
  title: string;
  lead: string;
  sub?: string;
  aside?: React.ReactNode;
};

export const MarketingPageHero: React.FC<HeroProps> = ({
  eyebrow,
  title,
  lead,
  sub,
  aside,
}) => (
  <header className="mkt-hero-band mkt-hero-band--plain">
    <div className={`mkt-hero${aside ? ' mkt-hero--split' : ''}`}>
      <div className="mkt-hero-copy">
        {eyebrow && <p className="mkt-hero-eyebrow">{eyebrow}</p>}
        <h1 className="mkt-hero-title">{title}</h1>
        <p className="mkt-hero-lead">{lead}</p>
        {sub && <p className="mkt-hero-sub">{sub}</p>}
      </div>
      {aside && <div className="mkt-hero-aside">{aside}</div>}
    </div>
  </header>
);

type FeatureCardProps = {
  index?: number;
  title: string;
  text: string;
  icon?: LucideIcon;
  visual?: React.ReactNode;
  className?: string;
};

export const MarketingFeatureCard: React.FC<FeatureCardProps> = ({
  index,
  title,
  text,
  icon: Icon,
  visual,
  className = '',
}) => (
  <article className={`mkt-card landing-glass-card ${className}`.trim()}>
    {visual && <div className="mkt-card-visual">{visual}</div>}
    <div className="mkt-card-body">
      {Icon && (
        <div className="mkt-card-icon" aria-hidden>
          <Icon size={20} strokeWidth={1.75} />
        </div>
      )}
      {index !== undefined && (
        <p className="mkt-card-index">{String(index + 1).padStart(2, '0')}</p>
      )}
      <h2 className="mkt-card-title">{title}</h2>
      <p className="mkt-card-text">{text}</p>
    </div>
  </article>
);

type GridProps = {
  columns?: 2 | 3;
  children: React.ReactNode;
  className?: string;
};

export const MarketingPageGrid: React.FC<GridProps> = ({
  columns = 2,
  children,
  className = '',
}) => (
  <div className={`mkt-grid mkt-grid--${columns} ${className}`.trim()}>{children}</div>
);

type CtaProps = {
  label?: string;
  secondary?: { to: string; label: string };
};

export const MarketingPageCta: React.FC<CtaProps> = ({
  label = 'Open app',
  secondary,
}) => (
  <div className="mkt-cta-row">
    <OpenAppLink className="mkt-cta-primary">
      {label}
      <ArrowRight size={16} strokeWidth={2.5} />
    </OpenAppLink>
    {secondary && (
      <Link to={secondary.to} className="mkt-cta-secondary">
        {secondary.label}
      </Link>
    )}
  </div>
);

export const MarketingDisclaimer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mkt-disclaimer">{children}</p>
);

export const MarketingSectionHeading: React.FC<{ title: string; sub?: string }> = ({
  title,
  sub,
}) => (
  <div className="mkt-section-heading">
    <h2 className="mkt-section-title">{title}</h2>
    {sub && <p className="mkt-section-sub">{sub}</p>}
  </div>
);

export const MarketingStatCard: React.FC<{ value: string; label: string }> = ({
  value,
  label,
}) => (
  <div className="mkt-stat-card landing-glass-card">
    <p className="mkt-stat-value">{value}</p>
    <p className="mkt-stat-label">{label}</p>
  </div>
);

type ArbitrumCalloutProps = {
  title: string;
  text: string;
  minHl: string;
  gas: string;
  doNotUseLabel: string;
  doNotUseItems: readonly string[];
};

export const MarketingArbitrumCallout: React.FC<ArbitrumCalloutProps> = ({
  title,
  text,
  minHl,
  gas,
  doNotUseLabel,
  doNotUseItems,
}) => (
  <article className="mkt-arbitrum-callout landing-glass-card">
    <div className="mkt-arbitrum-callout-brand" aria-hidden>
      <img src={ARBITRUM_LOGO} alt="" className="mkt-arbitrum-callout-logo" loading="lazy" decoding="async" />
      <img src={USDC_LOGO} alt="" className="mkt-arbitrum-callout-logo mkt-arbitrum-callout-logo--usdc" loading="lazy" decoding="async" />
    </div>
    <div className="mkt-arbitrum-callout-body">
      <h2 className="mkt-arbitrum-callout-title">{title}</h2>
      <p className="mkt-arbitrum-callout-text">{text}</p>
      <p className="mkt-arbitrum-callout-meta">{minHl}</p>
      <p className="mkt-arbitrum-callout-meta">{gas}</p>
      <div className="mkt-arbitrum-callout-dont">
        <p className="mkt-arbitrum-callout-dont-label">{doNotUseLabel}</p>
        <ul>
          {doNotUseItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  </article>
);

type CompactStep = { title: string; text: string };

export const MarketingCompactSteps: React.FC<{ steps: CompactStep[] }> = ({ steps }) => (
  <ol className="mkt-compact-steps landing-glass-card">
    {steps.map((step, i) => (
      <li key={step.title} className="mkt-compact-step">
        <span className="mkt-compact-step-num" aria-hidden>
          {String(i + 1).padStart(2, '0')}
        </span>
        <div className="mkt-compact-step-copy">
          <h3 className="mkt-compact-step-title">{step.title}</h3>
          <p className="mkt-compact-step-text">{step.text}</p>
        </div>
      </li>
    ))}
  </ol>
);

type FundListItem = { title: string; text: string; icon: LucideIcon };

export const MarketingFundsList: React.FC<{ items: FundListItem[] }> = ({ items }) => (
  <ul className="mkt-funds-list">
    {items.map(({ title, text, icon: Icon }) => (
      <li key={title} className="mkt-funds-list-item landing-glass-card">
        <div className="mkt-card-icon" aria-hidden>
          <Icon size={18} strokeWidth={1.75} />
        </div>
        <div className="mkt-funds-list-copy">
          <h3 className="mkt-funds-list-title">{title}</h3>
          <p className="mkt-funds-list-text">{text}</p>
        </div>
      </li>
    ))}
  </ul>
);

type PageProps = {
  children: React.ReactNode;
};

/** Full-width marketing inner pages — consistent nav offset & desktop grids */
const MarketingInnerPage: React.FC<PageProps> = ({ children }) => (
  <MarketingPageLayout inner>
    <div className="mkt-page">{children}</div>
  </MarketingPageLayout>
);

export default MarketingInnerPage;
