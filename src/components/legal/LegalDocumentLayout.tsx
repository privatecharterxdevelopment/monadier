import React from 'react';
import { Link } from 'react-router-dom';
import MarketingPageLayout from '../layout/MarketingPageLayout';
import { SUPPORT_EMAIL } from '../../lib/brand';

export type LegalSection = {
  title: string;
  body: React.ReactNode;
};

type Props = {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  backHref?: string;
  backLabel?: string;
};

const LegalDocumentLayout: React.FC<Props> = ({
  title,
  updated,
  intro,
  sections,
  backHref = '/register',
  backLabel = 'Back to registration',
}) => {
  return (
    <MarketingPageLayout narrow>
      <article className="legal-doc">
        <p className="legal-doc-eyebrow">Legal</p>
        <h1 className="legal-doc-title">{title}</h1>
        <p className="legal-doc-updated">Last updated: {updated}</p>
        <p className="legal-doc-intro">{intro}</p>

        <div className="legal-doc-sections">
          {sections.map((section) => (
            <section key={section.title} className="legal-doc-section">
              <h2 className="legal-doc-section-title">{section.title}</h2>
              <div className="legal-doc-section-body">{section.body}</div>
            </section>
          ))}
        </div>

        <p className="legal-doc-footer">
          Questions? Contact{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="legal-doc-link">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <div className="legal-doc-nav">
          <Link to={backHref} className="legal-doc-back">
            {backLabel}
          </Link>
          {title.includes('Terms') ? (
            <Link to="/privacy" className="legal-doc-link">
              Privacy Policy
            </Link>
          ) : (
            <Link to="/terms" className="legal-doc-link">
              Terms of Service
            </Link>
          )}
        </div>
      </article>
    </MarketingPageLayout>
  );
};

export default LegalDocumentLayout;
