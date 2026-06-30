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

function isContactSection(section: LegalSection): boolean {
  const normalized = section.title.replace(/^\d+\.\s*/, '').trim().toLowerCase();
  return /contact|kontakt|联系|お問い合わせ|ติดต่อ|contacto|contatti|контакт/i.test(
    normalized
  );
}

const LegalDocumentLayout: React.FC<Props> = ({
  title,
  updated,
  intro,
  sections,
  backHref = '/register',
  backLabel = 'Back to registration',
}) => {
  const lastSection = sections[sections.length - 1];
  const contactSection =
    lastSection && isContactSection(lastSection) ? lastSection : null;
  const mainSections = contactSection ? sections.slice(0, -1) : sections;

  return (
    <MarketingPageLayout inner legal>
      <article className="legal-doc">
        <p className="legal-doc-eyebrow">Legal</p>
        <h1 className="legal-doc-title">{title}</h1>
        <p className="legal-doc-updated">Last updated: {updated}</p>
        <p className="legal-doc-intro">{intro}</p>

        <div className="legal-doc-sections">
          {mainSections.map((section) => (
            <section key={section.title} className="legal-doc-section">
              <h2 className="legal-doc-section-title">{section.title}</h2>
              <div className="legal-doc-section-body">{section.body}</div>
            </section>
          ))}
        </div>

        <aside className="legal-doc-contact-card" aria-label="Contact and links">
          {contactSection ? (
            <div className="legal-doc-contact-card-main">
              <h2 className="legal-doc-contact-card-title">{contactSection.title}</h2>
              <div className="legal-doc-contact-card-body">{contactSection.body}</div>
            </div>
          ) : null}

          <div
            className={
              contactSection
                ? 'legal-doc-contact-card-footer'
                : 'legal-doc-contact-card-footer legal-doc-contact-card-footer--solo'
            }
          >
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
          </div>
        </aside>
      </article>
    </MarketingPageLayout>
  );
};

export default LegalDocumentLayout;
