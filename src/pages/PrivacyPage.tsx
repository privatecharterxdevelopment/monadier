import React from 'react';
import LegalDocumentLayout from '../components/legal/LegalDocumentLayout';

const PrivacyPage: React.FC = () => {
  return (
    <LegalDocumentLayout
      title="Privacy Policy"
      updated="June 2, 2026"
      intro="This Privacy Policy explains how Monadier collects, uses, and protects personal data when you use our website and trading application."
      backLabel="Back to registration"
      sections={[
        {
          title: '1. Who we are',
          body: (
            <p>
              Monadier operates the monadier.com website and app.monadier.com trading application. For
              privacy enquiries contact{' '}
              <a href="mailto:support@monadier.com" className="legal-doc-link">
                support@monadier.com
              </a>
              .
            </p>
          ),
        },
        {
          title: '2. Data we collect',
          body: (
            <>
              <p>Depending on how you use Monadier, we may process:</p>
              <ul>
                <li>Account data — email, name, country, username, profile avatar</li>
                <li>Wallet addresses you connect or link</li>
                <li>Trading activity, bot settings, and vault balances (on-chain data is public)</li>
                <li>Technical logs — IP address, browser type, device, session timestamps</li>
                <li>Support messages you send us</li>
              </ul>
            </>
          ),
        },
        {
          title: '3. How we use data',
          body: (
            <ul>
              <li>Provide and secure your account and dashboard</li>
              <li>Execute automated trading and display trade history</li>
              <li>Send service emails (confirmation, password reset, important notices)</li>
              <li>Improve reliability, prevent fraud, and comply with legal obligations</li>
            </ul>
          ),
        },
        {
          title: '4. Legal bases (EEA / UK)',
          body: (
            <p>
              Where GDPR applies, we rely on contract performance (providing the service), legitimate
              interests (security and product improvement), and consent where required (e.g. non-essential
              cookies).
            </p>
          ),
        },
        {
          title: '5. Sharing & processors',
          body: (
            <p>
              We use trusted infrastructure providers (e.g. hosting, database, email) under data-processing
              agreements. We do not sell your personal data. On-chain transactions are publicly visible on
              Arbitrum. We may disclose data if required by law or to protect rights and safety.
            </p>
          ),
        },
        {
          title: '6. Retention',
          body: (
            <p>
              We keep account data while your account is active and for a reasonable period afterward for
              legal, tax, and dispute-resolution purposes. You may request deletion subject to obligations
              we must retain.
            </p>
          ),
        },
        {
          title: '7. Your rights',
          body: (
            <p>
              Depending on your location you may have rights to access, correct, delete, or export your
              data, and to object to certain processing. Contact{' '}
              <a href="mailto:support@monadier.com" className="legal-doc-link">
                support@monadier.com
              </a>{' '}
              to exercise these rights.
            </p>
          ),
        },
        {
          title: '8. Security & international transfers',
          body: (
            <p>
              We apply technical and organisational measures to protect data. Your information may be
              processed in countries outside your own; we use appropriate safeguards where required.
            </p>
          ),
        },
        {
          title: '9. Changes',
          body: (
            <p>
              We may update this Policy by posting a new version on this page. Material changes will be
              indicated by updating the &ldquo;Last updated&rdquo; date above.
            </p>
          ),
        },
      ]}
    />
  );
};

export default PrivacyPage;
