import React, { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BRAND_DOMAIN,
  BRAND_NAME,
  OFFICIAL_X_HANDLE,
  SUPPORT_EMAIL,
} from '../../lib/brand';

const LORENZO_LINKEDIN = 'https://www.linkedin.com/in/lorenzo-vanza-1894b1187/';
const LORENZO_NAME = 'Lorenzo Vanza';

type LegalBlock = {
  id: string;
  heading?: string;
  paragraphs: string[];
};

type LegalCopy = {
  ariaLabel?: string;
  operator?: string[];
  blocks?: LegalBlock[];
  tagline?: string;
};

function linkifyLorenzo(text: string): ReactNode {
  if (!text.includes(LORENZO_NAME)) return text;

  const parts = text.split(LORENZO_NAME);
  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part) nodes.push(part);
    if (i < parts.length - 1) {
      nodes.push(
        <a
          key={`lv-${i}`}
          href={LORENZO_LINKEDIN}
          target="_blank"
          rel="noopener noreferrer"
          className="landing-gmx-footer-legal-link"
        >
          {LORENZO_NAME}
        </a>
      );
    }
  });
  return nodes;
}

const LandingLegalDisclaimers: React.FC = () => {
  const { t, i18n } = useTranslation();

  const legal = useMemo(() => {
    const raw = t('landing.legal', {
      returnObjects: true,
      brand: BRAND_NAME,
      domain: BRAND_DOMAIN,
      email: SUPPORT_EMAIL,
      xHandle: OFFICIAL_X_HANDLE,
    });
    return (raw && typeof raw === 'object' ? raw : {}) as LegalCopy;
  }, [t, i18n.language]);

  const operator = Array.isArray(legal.operator) ? legal.operator : [];
  const blocks = Array.isArray(legal.blocks) ? legal.blocks : [];
  const tagline = typeof legal.tagline === 'string' ? legal.tagline : '';
  const ariaLabel =
    typeof legal.ariaLabel === 'string' ? legal.ariaLabel : 'Legal disclosures';

  return (
    <div className="landing-gmx-footer-legal" aria-label={ariaLabel}>
      {operator.map((paragraph, i) => (
        <p key={`op-${i}`} className="landing-gmx-footer-legal-p">
          {linkifyLorenzo(paragraph)}
        </p>
      ))}

      {blocks.map((block) => (
        <section key={block.id} className="landing-gmx-footer-legal-block">
          {block.heading ? (
            <h3 className="landing-gmx-footer-legal-heading">{block.heading}</h3>
          ) : null}
          {(block.paragraphs ?? []).map((paragraph, i) => (
            <p key={`${block.id}-${i}`} className="landing-gmx-footer-legal-p">
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      {tagline ? (
        <p className="landing-gmx-footer-legal-tagline">{tagline}</p>
      ) : null}
    </div>
  );
};

export default LandingLegalDisclaimers;
