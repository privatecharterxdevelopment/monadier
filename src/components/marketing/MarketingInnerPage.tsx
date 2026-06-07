import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import MarketingPageLayout from '../layout/MarketingPageLayout';
import OpenAppLink from '../layout/OpenAppLink';

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
  <header className={`mkt-hero${aside ? ' mkt-hero--split' : ''}`}>
    <div className="mkt-hero-copy">
      {eyebrow && <p className="mkt-hero-eyebrow">{eyebrow}</p>}
      <h1 className="mkt-hero-title">{title}</h1>
      <p className="mkt-hero-lead">{lead}</p>
      {sub && <p className="mkt-hero-sub">{sub}</p>}
    </div>
    {aside && <div className="mkt-hero-aside">{aside}</div>}
  </header>
);

type FeatureCardProps = {
  index?: number;
  title: string;
  text: string;
  icon?: LucideIcon;
};

export const MarketingFeatureCard: React.FC<FeatureCardProps> = ({
  index,
  title,
  text,
  icon: Icon,
}) => (
  <article className="mkt-card">
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
  <div className="mkt-stat-card">
    <p className="mkt-stat-value">{value}</p>
    <p className="mkt-stat-label">{label}</p>
  </div>
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
