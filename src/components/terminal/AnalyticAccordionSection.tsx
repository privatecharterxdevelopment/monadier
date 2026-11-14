import React, { type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

type Props = {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  badge?: ReactNode;
};

/** Collapsible analytic block — native details for a11y + clean dropdown UX. */
const AnalyticAccordionSection: React.FC<Props> = ({
  title,
  meta,
  defaultOpen = false,
  children,
  badge,
}) => (
  <details className="term-analytic-section" open={defaultOpen}>
    <summary className="term-analytic-section__head">
      <span className="term-analytic-section__title">{title}</span>
      {badge ? <span className="term-analytic-section__badge">{badge}</span> : null}
      {meta ? <span className="term-analytic-section__meta">{meta}</span> : null}
      <ChevronDown size={14} className="term-analytic-section__chev" aria-hidden />
    </summary>
    <div className="term-analytic-section__body">{children}</div>
  </details>
);

export default AnalyticAccordionSection;