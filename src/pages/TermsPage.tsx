import React from 'react';
import LegalDocumentLayout from '../components/legal/LegalDocumentLayout';

const TermsPage: React.FC = () => {
  return (
    <LegalDocumentLayout
      title="Terms of Service"
      updated="June 2, 2026"
      intro="These Terms govern your use of Monadier — the Hyperliquid automated trading platform. By creating an account or using the service, you agree to these Terms."
      sections={[
        {
          title: '1. Service description',
          body: (
            <p>
              Monadier provides software to connect your wallet to your Hyperliquid account and
              optional automated trading on Hyperliquid perpetual markets. We do not provide
              personalised financial advice. You are solely responsible for your trading decisions.
            </p>
          ),
        },
        {
          title: '2. Eligibility & account',
          body: (
            <p>
              You must be at least 18 years old and legally permitted to use crypto trading services in
              your jurisdiction. You are responsible for keeping your login credentials secure. Your
              public username is permanent once set.
            </p>
          ),
        },
        {
          title: '3. Non-custodial HL account & wallet',
          body: (
            <p>
              USDC deposits are held on your Hyperliquid account in your name. Withdrawals and
              deposits require your wallet signature. Monadier does not hold your private keys. Trading
              on Hyperliquid and DeFi protocols carry technical and market risk — including total loss of
              deposited funds.
            </p>
          ),
        },
        {
          title: '4. Automated trading',
          body: (
            <p>
              When you enable auto-trading, the bot may open and close Hyperliquid perpetual positions according
              to your configured settings. Past performance does not guarantee future results. You may stop
              the bot or request manual position closes at any time through the dashboard.
            </p>
          ),
        },
        {
          title: '5. Fees',
          body: (
            <p>
              Standard blockchain gas fees and Hyperliquid protocol fees apply. Monadier may charge a performance
              fee on profitable closed trades as disclosed in the app. Subscription or license fees, if
              applicable, are shown on the pricing page before purchase.
            </p>
          ),
        },
        {
          title: '6. Prohibited use',
          body: (
            <p>
              You may not use Monadier for money laundering, market manipulation, unauthorised access, or
              any activity that violates applicable law. We may suspend accounts that abuse the service
              or pose security risk.
            </p>
          ),
        },
        {
          title: '7. Disclaimer & liability',
          body: (
            <p>
              The service is provided &ldquo;as is&rdquo; without warranties. To the maximum extent
              permitted by law, Monadier is not liable for trading losses, smart-contract failures,
              network outages, or third-party protocol issues. Nothing in these Terms limits liability
              where it cannot be excluded under applicable law.
            </p>
          ),
        },
        {
          title: '8. Changes & termination',
          body: (
            <p>
              We may update these Terms by posting a revised version on this page. Continued use after
              changes constitutes acceptance. You may stop using Monadier at any time and withdraw vault
              funds when not locked in an open position.
            </p>
          ),
        },
      ]}
    />
  );
};

export default TermsPage;
