import React from 'react';
import {
  LANDING_LEGAL_BLOCKS,
  LANDING_LEGAL_TAGLINE,
  LANDING_OPERATOR_DISCLOSURE,
} from '../../content/landingLegalDisclaimers';

const LandingLegalDisclaimers: React.FC = () => (
  <div className="landing-gmx-footer-legal" aria-label="Legal disclosures">
    {LANDING_OPERATOR_DISCLOSURE.map((paragraph, i) => (
      <p key={`op-${i}`} className="landing-gmx-footer-legal-p">
        {paragraph}
      </p>
    ))}

    {LANDING_LEGAL_BLOCKS.map((block) => (
      <section key={block.id} className="landing-gmx-footer-legal-block">
        {block.heading ? (
          <h3 className="landing-gmx-footer-legal-heading">{block.heading}</h3>
        ) : null}
        {block.paragraphs.map((paragraph, i) => (
          <p key={`${block.id}-${i}`} className="landing-gmx-footer-legal-p">
            {paragraph}
          </p>
        ))}
      </section>
    ))}

    <p className="landing-gmx-footer-legal-tagline">{LANDING_LEGAL_TAGLINE}</p>
  </div>
);

export default LandingLegalDisclaimers;
