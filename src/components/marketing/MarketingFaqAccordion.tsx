import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LandingFaqItem } from '../../lib/supportFaq';

type Props = {
  items: LandingFaqItem[];
  className?: string;
  idPrefix?: string;
};

const MarketingFaqAccordion: React.FC<Props> = ({
  items,
  className = '',
  idPrefix = 'mkt-faq',
}) => {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggle = (q: string) => {
    setOpenKey((prev) => (prev === q ? null : q));
  };

  return (
    <div className={`landing-gmx-faq-grid mkt-faq-accordion ${className}`.trim()}>
      {items.map((item, i) => {
        const isOpen = openKey === item.q;
        const panelId = `${idPrefix}-panel-${i}`;
        const buttonId = `${idPrefix}-button-${i}`;

        return (
          <div
            key={`${item.tab}-${item.q}`}
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
          </div>
        );
      })}
    </div>
  );
};

export default MarketingFaqAccordion;
