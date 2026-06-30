import React from 'react';
import LegalDocumentLayout from '../components/legal/LegalDocumentLayout';
import { HYPERGAIN_TERMS_SECTIONS } from '../content/hypergainTermsOfService';
import { BRAND_NAME } from '../lib/brand';

const TermsPage: React.FC = () => {
  return (
    <LegalDocumentLayout
      title={`${BRAND_NAME} Terms of Service`}
      updated="June 30, 2026"
      intro={`These Terms of Service ("Terms") govern access to and use of ${BRAND_NAME} automated Hyperliquid trading software. Please read them carefully. By using the Service, you agree to be bound by these Terms and our Privacy Policy.`}
      sections={HYPERGAIN_TERMS_SECTIONS}
    />
  );
};

export default TermsPage;
