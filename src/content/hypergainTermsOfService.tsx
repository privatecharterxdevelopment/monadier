import React from 'react';
import { Link } from 'react-router-dom';
import { BRAND_APP_URL, BRAND_DOMAIN, BRAND_NAME, SUPPORT_EMAIL } from '../lib/brand';
import type { LegalSection } from '../components/legal/LegalDocumentLayout';

const p = (...nodes: React.ReactNode[]) => <p>{nodes}</p>;

const ol = (items: React.ReactNode[]) => (
  <ol className="legal-doc-clause-list">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ol>
);

const sub = (items: React.ReactNode[]) => (
  <ol>
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ol>
);

/** HyperGain Terms of Service — comprehensive platform terms. */
export const HYPERGAIN_TERMS_SECTIONS: LegalSection[] = [
  {
    title: '1. Introduction and acceptance',
    body: (
      <>
        {p(
          `These Terms of Service (these "Terms") constitute a legally binding agreement between you ("User", "you", or "your") and the operator of ${BRAND_NAME} (the "Operator", "we", "us", or "our") governing access to and use of the ${BRAND_NAME} website at `,
          BRAND_DOMAIN,
          ', the application at ',
          BRAND_APP_URL,
          ', and all related software, interfaces, application programming interfaces, documentation, and support channels (collectively, the "Service").'
        )}
        {p(
          'By (a) creating an account; (b) connecting a digital wallet; (c) approving a Hyperliquid trading agent through the Service; (d) depositing or trading via interfaces we provide; or (e) otherwise accessing or using the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms and by our ',
          <Link to="/privacy" className="legal-doc-link">
            Privacy Policy
          </Link>,
          ', which is incorporated herein by reference. If you do not agree, you must not access or use the Service.'
        )}
        {p(
          'If you accept these Terms on behalf of a legal entity, you represent that you have authority to bind that entity, and "you" refers to that entity.'
        )}
      </>
    ),
  },
  {
    title: '2. Definitions',
    body: (
      <>
        {p('In these Terms, the following definitions apply:')}
        {ol([
          <>
            <span className="legal-doc-clause-label">"Account"</span> means the registered user profile
            associated with your email, OAuth identity, wallet address, or other credentials we
            recognise.
          </>,
          <>
            <span className="legal-doc-clause-label">"Accrued Fees"</span> means platform success fees
            and related amounts recorded in your fee ledger as owed to the Operator but not yet paid.
          </>,
          <>
            <span className="legal-doc-clause-label">"Agent"</span> means the Hyperliquid API agent you
            approve to place and manage orders on your behalf within limits set by Hyperliquid and
            your approval.
          </>,
          <>
            <span className="legal-doc-clause-label">"Automated Trading"</span> means bot or
            algorithmic execution that opens, manages, or closes positions without manual
            confirmation for each order while enabled.
          </>,
          <>
            <span className="legal-doc-clause-label">"Hyperliquid"</span> means the Hyperliquid
            decentralised exchange protocol, clearing systems, and related interfaces operated
            independently of the Operator.
          </>,
          <>
            <span className="legal-doc-clause-label">"Platform Success Fee"</span> means the
            success-based fee charged by the Operator on qualifying profitable closed trades, as
            disclosed in the Service (currently up to ten percent (10%) of gross realised profit on
            applicable closes, subject to change).
          </>,
          <>
            <span className="legal-doc-clause-label">"Prohibited Jurisdiction"</span> means any
            country, territory, or region where your use of leveraged crypto derivatives, automated
            trading bots, or outcome markets would violate applicable law, or where we restrict
            access.
          </>,
          <>
            <span className="legal-doc-clause-label">"Service"</span> has the meaning given in Section
            1.
          </>,
          <>
            <span className="legal-doc-clause-label">"Wallet"</span> means the non-custodial digital
            wallet you connect, through which you sign transactions and authorisations.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '3. Nature of the Service',
    body: (
      <>
        {p(
          `${BRAND_NAME} provides non-custodial software only. We do not operate as a broker, dealer, exchange, custodian, bank, trust company, investment adviser, commodity trading adviser, portfolio manager, or tax agent. We do not solicit orders, recommend specific trades tailored to your financial situation, or guarantee any outcome.`
        )}
        {ol([
          <>
            The Service may analyse market data, display signals, and — when you enable Automated
            Trading — transmit orders to Hyperliquid through an Agent you approve.
          </>,
          <>
            Your USDC margin, open positions, and realised profit or loss remain on your Hyperliquid
            account in your name. We never take possession of your private keys or the ability to
            withdraw Hyperliquid balances without your Wallet signature.
          </>,
          <>
            Hyperliquid is a third-party protocol. Your relationship with Hyperliquid is governed
            exclusively by Hyperliquid&apos;s terms, policies, and technical rules. We are not
            responsible for Hyperliquid outages, insolvency, governance decisions, or protocol changes.
          </>,
          <>
            Certain features (including sports outcome markets or prediction markets) may be
            unavailable in some regions. Availability does not imply legality in your jurisdiction.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '4. Eligibility and representations',
    body: (
      <>
        {p('You represent, warrant, and covenant that, at all times while using the Service:')}
        {ol([
          <>
            You are at least eighteen (18) years of age, or the age of legal majority in your
            jurisdiction if higher, and have full legal capacity to enter into these Terms.
          </>,
          <>
            You are not located in, organised in, or a resident of any Prohibited Jurisdiction, and
            you are not subject to economic or trade sanctions administered by the United Nations,
            United States, European Union, United Kingdom, or other competent authority.
          </>,
          <>
            Your access to and use of the Service, Hyperliquid, crypto assets, leveraged derivatives,
            Automated Trading, and any outcome or sports markets is lawful in every jurisdiction
            where you reside, are domiciled, hold citizenship, or physically or digitally access the
            Service.
          </>,
          <>
            You will not use virtual private networks, proxies, Tor, or similar anonymisation tools
            to conceal your location in order to access the Service where prohibited, evade
            enforcement, or circumvent fee or compliance controls (see Section 13).
          </>,
          <>
            All information you provide is accurate, current, and complete; you will promptly update
            it if it changes.
          </>,
        ])}
        {p(
          'You alone are responsible for determining whether your activities require licences, registrations, or approvals in your jurisdiction. We make no representation that the Service is appropriate or available for use in any particular location.'
        )}
      </>
    ),
  },
  {
    title: '5. Account registration and security',
    body: (
      <>
        {ol([
          <>
            <strong>Registration.</strong> You may register through email, third-party OAuth, or
            Wallet connection as offered. You must maintain the confidentiality of credentials and
            promptly notify us of unauthorised access at {SUPPORT_EMAIL}.
          </>,
          <>
            <strong>Username.</strong> Your public username, once chosen, may be permanent and
            publicly visible. Offensive, misleading, or impersonating names may be changed or
            removed at our discretion.
          </>,
          <>
            <strong>One account per natural person.</strong> Each individual may maintain only one
            active Account unless we expressly authorise otherwise in writing. You must not create,
            control, fund, or benefit from multiple Accounts to:
            {sub([
              'evade Platform Success Fees or fee enforcement;',
              'abuse referral, promotional, or affiliate programmes;',
              'circumvent suspensions or geographic restrictions; or',
              'otherwise violate these Terms.',
            ])}
          </>,
          <>
            <strong>Account linking.</strong> We may associate Accounts using wallet addresses, device
            identifiers, IP and network telemetry, payment patterns, on-chain activity, behavioural
            signals, or other lawful indicators of common control. Linked Accounts may be suspended
            or terminated together.
          </>,
          <>
            <strong>Security.</strong> You are solely responsible for Wallet security, seed phrases,
            and hardware devices. We will never ask for your seed phrase. Loss of Wallet access may
            result in permanent loss of funds on Hyperliquid; we cannot recover them.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '6. Wallet connection, Agent approval, and non-custodial trading',
    body: (
      <>
        {ol([
          <>
            <strong>Deposits and withdrawals.</strong> Funding Hyperliquid and withdrawing USDC require
            your Wallet signature via Hyperliquid or supported bridges. The Operator does not process
            bank wires or hold fiat on your behalf.
          </>,
          <>
            <strong>Agent scope.</strong> By approving the {BRAND_NAME} Agent on Hyperliquid, you
            instruct us to submit orders, modifications, and cancellations permitted by Hyperliquid
            within the scope of your settings. The Agent cannot withdraw assets from Hyperliquid to
            external addresses without your Wallet.
          </>,
          <>
            <strong>Your responsibility.</strong> Every order, fill, funding payment, liquidation,
            fee, and tax consequence is yours alone. Enabling Automated Trading constitutes ongoing
            authorisation for the Service to act according to your configuration until you disable
            it or revoke the Agent on Hyperliquid.
          </>,
          <>
            <strong>No bail-out.</strong> We do not guarantee stop-loss execution, take-profit
            fills, profit targets, or protection from liquidation. Slippage, partial fills, and
            rejected orders may occur.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '7. No investment advice; no guaranteed returns',
    body: (
      <>
        {ol([
          <>
            <strong>No advice.</strong> All content — including signals, charts, confidence scores,
            educational material, marketing copy, FAQs, and support responses — is provided for
            general information and software access only. Nothing constitutes investment, financial,
            legal, tax, or accounting advice, or a recommendation suitable for your circumstances.
          </>,
          <>
            <strong>No guaranteed or promised returns.</strong> The Operator does not promise,
            project, guarantee, or warrant any specific profit, rate of return, yield, capital
            preservation, or avoidance of loss. Statements about past performance, win rates,
            backtests, simulations, or examples are illustrative only and are not reliable indicators
            of future results.
          </>,
          <>
            <strong>Assumption of risk.</strong> Crypto assets and leveraged perpetual contracts are
            highly speculative. You may lose some or all of your margin rapidly, including through
            liquidation. Only trade with capital you can afford to lose entirely.
          </>,
          <>
            <strong>AI and automation limits.</strong> Machine learning, heuristics, and automated
            systems may contain errors, latency, stale data, or failure modes. They may perform
            poorly during extreme volatility, low liquidity, news events, or protocol incidents.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '8. Automated trading',
    body: (
      <>
        {ol([
          <>
            <strong>Configuration.</strong> You are responsible for leverage, position sizing, stop
            settings, bot activation, and monitoring. Default parameters may not suit your risk
            tolerance.
          </>,
          <>
            <strong>Continuous operation.</strong> While Automated Trading is active, the Service may
            open and close positions at any time without per-trade confirmation. Stopping the bot in
            the dashboard does not necessarily close open Hyperliquid positions unless you execute
            closes or configure otherwise.
          </>,
          <>
            <strong>Server dependency.</strong> Automation runs on Operator-controlled
            infrastructure (including cloud servers). Interruptions, bugs, deployment errors, or
            third-party outages may delay or prevent intended actions.
          </>,
          <>
            <strong>Profit-only and loss-handling modes.</strong> Where the Service offers
            profit-only exits or configurable loss limits, such features are mechanical rules, not
            guarantees. Gaps, funding, and exchange rules may still produce losses beyond configured
            thresholds.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '9. Fees and billing',
    body: (
      <>
        {p(
          'In addition to Hyperliquid protocol fees, network gas, bridge costs, and funding rates (which we do not control), the following Operator charges may apply:'
        )}
        {ol([
          <>
            <strong>Platform Success Fee.</strong> On qualifying profitable closed trades (including
            bot and, where enabled, manual or betting-related sources), a Platform Success Fee accrues
            based on gross realised profit at the rate displayed in the Service (currently ten percent
            (10%) unless otherwise disclosed). Fees apply only to profitable closes as determined from
            Hyperliquid fill data. Minimum fee thresholds may apply to very small profits.
          </>,
          <>
            <strong>Hyperliquid builder fees.</strong> Where enabled, a portion of the Platform Success
            Fee may be routed via Hyperliquid builder codes; the net amount accrued to the Operator
            is shown in your fee ledger.
          </>,
          <>
            <strong>Other fees.</strong> Subscription, licence, premium feature, or betting success
            fees may apply when offered and accepted. Current rates are disclosed in-app before you
            incur material obligations.
          </>,
          <>
            <strong>Accrual and ledger.</strong> Accrued Fees are recorded per Wallet in our fee
            ledger when profitable closes are detected. You may review accrued amounts, win counts, and
            trade-level detail in the Service.
          </>,
          <>
            <strong>Payment method.</strong> Unless we specify otherwise, Accrued Fees must be paid in
            native USDC on Arbitrum One to the treasury address displayed in the Service. You bear all
            gas and transaction costs. Under- or over-payments may require manual reconciliation.
          </>,
          <>
            <strong>No offset against trading losses.</strong> Platform Success Fees are owed on
            qualifying profitable closes regardless of your overall portfolio performance, unless we
            expressly waive amounts in writing.
          </>,
          <>
            <strong>Changes.</strong> We may modify fee rates, thresholds, and collection mechanics
            with notice via updated Terms or in-app disclosure. Changes apply prospectively unless
            mandatory law requires otherwise.
          </>,
          <>
            <strong>Taxes on fees.</strong> Stated fees are exclusive of VAT, GST, or similar taxes
            unless stated. You are responsible for any taxes on fees you pay us.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '10. Fee enforcement, blocks, and suspension for non-payment',
    body: (
      <>
        {p(
          'When Platform Success Fee collection is enabled and you have unpaid Accrued Fees, we may enforce payment as follows:'
        )}
        {ol([
          <>
            <strong>Withdrawal block.</strong> Initiation of Hyperliquid withdrawals through the
            Service interface may be disabled until all Accrued Fees are paid in full.
          </>,
          <>
            <strong>Trading block.</strong> After a disclosed number of qualifying profitable closes
            without settlement (currently twenty (20) bot wins, subject to change), new Automated
            Trading opens and certain order entry features may be disabled until Accrued Fees are paid.
          </>,
          <>
            <strong>Account suspension.</strong> We may suspend Automated Trading, API access, login,
            or the entire Account for non-payment, suspected fee evasion, or related violations.
            Suspension persists until all outstanding Accrued Fees, chargebacks, and applicable
            penalties are satisfied, unless waived in writing.
          </>,
          <>
            <strong>Direct Hyperliquid access.</strong> Interface blocks do not remove your ability to
            interact with Hyperliquid directly via app.hyperliquid.xyz or other official clients using
            your Wallet, subject to Hyperliquid rules. Using the Service while deliberately evading
            Accrued Fee obligations constitutes a material breach.
          </>,
          <>
            <strong>Collection.</strong> Unpaid amounts may be referred to collections or legal
            proceedings where permitted. We may withhold referral payouts, promotions, or fee waivers
            for Accounts in default.
          </>,
          <>
            <strong>No refund of trading losses.</strong> Fee enforcement does not entitle you to
            compensation for trading losses, liquidations, or opportunity cost.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '11. Taxes and regulatory compliance',
    body: (
      <>
        {ol([
          <>
            <strong>Your tax obligations.</strong> You are solely responsible for determining,
            reporting, and paying all taxes arising from your trading and betting activity, including
            income tax, capital gains tax, corporation tax, GST, VAT, stamp duty, and withholding
            obligations in your country of residence, citizenship, or establishment.
          </>,
          <>
            <strong>India and other specific regimes.</strong> Without limitation, residents of India
            may be subject to income tax, GST, TDS, and reporting requirements on crypto and
            derivative transactions under applicable law (including provisions administered by the
            Income Tax Department and other authorities). Similar specialised rules may apply in other
            countries. The Operator does not determine your tax liability, withhold on your behalf
            (except where legally required and explicitly stated), or file returns for you.
          </>,
          <>
            <strong>No tax advice.</strong> We do not provide tax advice or jurisdiction-specific tax
            documentation unless explicitly offered. Consult qualified professionals before trading.
          </>,
          <>
            <strong>Records.</strong> You should maintain your own records. We may provide trade
            history exports but do not warrant completeness for tax filing purposes.
          </>,
          <>
            <strong>Regulatory change.</strong> Laws governing crypto, derivatives, and automated
            trading evolve. Continued use after legal changes in your jurisdiction is at your own risk.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '12. Prohibited conduct',
    body: (
      <>
        {p('You must not, directly or indirectly:')}
        {ol([
          'violate any applicable law, regulation, court order, or Hyperliquid rule;',
          'access the Service from a Prohibited Jurisdiction or use VPNs, proxies, Tor, or location masking to circumvent geographic, sanctions, or enforcement controls;',
          'maintain or use multiple Accounts in violation of Section 5;',
          'evade, disable, or interfere with Platform Success Fee accrual, payment, or enforcement;',
          'engage in market manipulation, wash trading, spoofing, layering, front-running, or abusive order patterns;',
          'exploit bugs, vulnerabilities, or race conditions for unfair advantage without responsible disclosure;',
          'reverse engineer, decompile, or scrape the Service except where legally permitted;',
          'overload, disrupt, or attack Service infrastructure;',
          'use the Service for money laundering, terrorist financing, sanctions evasion, fraud, or child exploitation;',
          'misrepresent identity, residency, eligibility, or affiliation;',
          'use the Service on behalf of undisclosed third parties in a managed account or fund arrangement without our written consent;',
          'resell, white-label, or commercially exploit the Service without authorisation.',
        ])}
        {p(
          'We may investigate violations using lawful means including IP geolocation, blockchain analytics, device fingerprinting, and pattern analysis. We cooperate with law enforcement where required.'
        )}
      </>
    ),
  },
  {
    title: '13. VPN, proxies, and restricted jurisdictions',
    body: (
      <>
        {ol([
          <>
            <strong>Policy.</strong> Use of VPNs, proxy servers, Tor, or similar technologies to
            access the Service while concealing your true location — particularly to use Automated
            Trading, leveraged crypto, or outcome markets where such use is restricted or prohibited
            — is expressly prohibited.
          </>,
          <>
            <strong>No liability.</strong> To the fullest extent permitted by law, the Operator
            accepts no liability for any loss, regulatory penalty, tax assessment, account freeze,
            prosecution, or termination arising from your use of VPNs or proxies, whether or not we
            detect such use.
          </>,
          <>
            <strong>Enforcement.</strong> We may restrict, suspend, or permanently terminate Accounts
            exhibiting circumvention patterns, accessing from Prohibited Jurisdictions, or violating
            sanctions rules. No refund of Accrued Fees, prepaid access, or compensation for trading
            losses is owed for terminations based on this Section.
          </>,
          <>
            <strong>User responsibility.</strong> If trading bots, leveraged derivatives, or
            prediction markets are illegal where you live, you must not use the Service — regardless of
            technical feasibility or anonymisation tools.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '14. Referrals and promotions',
    body: (
      <>
        {ol([
          'Referral, affiliate, or promotional programmes may be offered subject to separate rules displayed in the Service.',
          'Abuse — including self-referrals, multi-Account schemes, or artificial volume — voids rewards and may trigger termination.',
          'We may modify or discontinue programmes at any time.',
          'Referral earnings may be withheld or offset against unpaid Accrued Fees.',
        ])}
      </>
    ),
  },
  {
    title: '15. Intellectual property',
    body: (
      <>
        {ol([
          <>
            The Service, including software, source and object code, user interface, design, logos,
            trademarks, and documentation, is owned by the Operator or its licensors and protected by
            intellectual property laws.
          </>,
          <>
            Subject to these Terms, we grant you a limited, revocable, non-exclusive,
            non-transferable, non-sublicensable licence to access and use the Service for personal,
            lawful trading automation.
          </>,
          <>
            You must not copy, modify, distribute, sell, lease, or create derivative works from the
            Service except as permitted by mandatory law or our written consent.
          </>,
          <>
            Feedback you provide may be used by us without restriction or compensation.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '16. Third-party services and open protocols',
    body: (
      <>
        {ol([
          'The Service integrates with Hyperliquid, Wallet providers, RPC nodes, analytics, cloud hosting, and other third parties.',
          'We do not control and are not liable for third-party availability, security breaches, policy changes, insolvency, or data practices.',
          'On-chain data is public. Blockchain transactions are irreversible.',
          'Links to third-party sites are provided for convenience and do not constitute endorsement.',
        ])}
      </>
    ),
  },
  {
    title: '17. Privacy',
    body: (
      <>
        {p(
          'Our collection and use of personal data is described in the ',
          <Link to="/privacy" className="legal-doc-link">
            Privacy Policy
          </Link>,
          '. By using the Service, you consent to such processing in accordance with applicable data protection law.'
        )}
      </>
    ),
  },
  {
    title: '18. Disclaimers of warranties',
    body: (
      <>
        {p(
          'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITH ALL FAULTS. THE OPERATOR AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, CONTRACTORS, AND SUPPLIERS EXPRESSLY DISCLAIM ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, QUIET ENJOYMENT, ACCURACY, AND ANY WARRANTIES ARISING FROM COURSE OF DEALING OR USAGE OF TRADE.'
        )}
        {p(
          'Without limiting the foregoing, we do not warrant that: (a) the Service will be uninterrupted, secure, or error-free; (b) signals or automation will be profitable; (c) defects will be corrected; or (d) the Service is free of viruses or harmful components.'
        )}
      </>
    ),
  },
  {
    title: '19. Limitation of liability',
    body: (
      <>
        {ol([
          <>
            <strong>Exclusion of damages.</strong> TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT
            SHALL THE OPERATOR OR ITS AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA,
            GOODWILL, OR BUSINESS OPPORTUNITY, WHETHER ARISING IN CONTRACT, TORT (INCLUDING
            NEGLIGENCE), STRICT LIABILITY, OR OTHERWISE, EVEN IF ADVISED OF THE POSSIBILITY.
          </>,
          <>
            <strong>Trading losses.</strong> Without limitation, we are not liable for trading losses,
            liquidations, missed trades, slippage, erroneous signals, smart-contract failures, bridge
            failures, Wallet compromise, or Hyperliquid protocol failures.
          </>,
          <>
            <strong>Cap.</strong> Our aggregate liability for all claims arising out of or relating to
            the Service or these Terms shall not exceed the greater of: (a) the total Platform Success
            Fees actually paid by you to the Operator in the twelve (12) months preceding the event
            giving rise to the claim; or (b) one hundred United States dollars (USD $100).
          </>,
          <>
            <strong>Mandatory law.</strong> Nothing in these Terms excludes or limits liability that
            cannot be excluded or limited under applicable mandatory consumer protection or other
            non-waivable law.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '20. Indemnification',
    body: (
      <>
        {p(
          'You agree to defend, indemnify, and hold harmless the Operator and its affiliates, officers, directors, employees, contractors, and agents from and against any claims, demands, actions, damages, losses, liabilities, penalties, fines, costs, and expenses (including reasonable attorneys\' fees) arising out of or relating to:'
        )}
        {ol([
          'your use or misuse of the Service;',
          'your trading activity on Hyperliquid;',
          'your violation of these Terms or applicable law;',
          'your use of VPNs, proxies, or location masking;',
          'your tax non-compliance or regulatory violations;',
          'your infringement of third-party rights;',
          'any dispute between you and another User.',
        ])}
        {p(
          'We may assume exclusive defence and control of any matter subject to indemnification; you will cooperate at your expense.'
        )}
      </>
    ),
  },
  {
    title: '21. Suspension and termination',
    body: (
      <>
        {ol([
          <>
            <strong>By us.</strong> We may suspend or terminate your Account immediately, with or
            without notice, for: non-payment of Accrued Fees; multi-Account abuse; VPN or
            circumvention; Prohibited Jurisdiction access; security incidents; market abuse; material
            breach of these Terms; or legal compulsion.
          </>,
          <>
            <strong>By you.</strong> You may cease using the Service at any time and revoke the Agent
            on Hyperliquid. Termination does not relieve you of Accrued Fee obligations incurred before
            termination.
          </>,
          <>
            <strong>Effect.</strong> Upon termination, licences granted to you end. Provisions that by
            their nature should survive (including Sections 7, 9–11, 13, 18–20, 22–26) survive
            termination.
          </>,
          <>
            <strong>No liability for termination.</strong> We are not liable to you for termination
            permitted by these Terms, except where mandatory law provides otherwise.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '22. Force majeure',
    body: (
      <>
        {p(
          'We are not liable for any failure or delay resulting from events beyond our reasonable control, including acts of God, war, terrorism, civil unrest, labour disputes, power or internet failures, blockchain congestion, exchange outages, regulatory actions, sanctions, or failures of third-party infrastructure.'
        )}
      </>
    ),
  },
  {
    title: '23. Assignment',
    body: (
      <>
        {p(
          'You may not assign or transfer these Terms or your Account without our prior written consent. We may assign these Terms in connection with a merger, acquisition, corporate reorganisation, or sale of assets, or to an affiliate, with notice where required by law.'
        )}
      </>
    ),
  },
  {
    title: '24. Severability; waiver; entire agreement',
    body: (
      <>
        {ol([
          <>
            <strong>Severability.</strong> If any provision is held invalid or unenforceable, the
            remaining provisions remain in full force, and the invalid provision shall be modified to
            the minimum extent necessary to make it valid and enforceable.
          </>,
          <>
            <strong>Waiver.</strong> Failure to enforce any provision is not a waiver of future
            enforcement.
          </>,
          <>
            <strong>Entire agreement.</strong> These Terms and the Privacy Policy constitute the entire
            agreement between you and the Operator regarding the Service and supersede prior
            agreements or understandings on the same subject matter.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '25. Changes to these Terms',
    body: (
      <>
        {ol([
          'We may amend these Terms by posting an updated version with a revised "Last updated" date.',
          'Material changes may additionally be communicated via the Service or email where practicable.',
          'Your continued access or use after the effective date constitutes acceptance, unless prohibited by applicable law.',
          'If you do not agree to amended Terms, you must stop using the Service and pay outstanding Accrued Fees.',
        ])}
      </>
    ),
  },
  {
    title: '26. Governing law and dispute resolution',
    body: (
      <>
        {ol([
          <>
            <strong>Governing law.</strong> These Terms are governed by the substantive laws of the
            jurisdiction in which the Operator is established, without regard to conflict-of-law
            principles, except where mandatory consumer protection laws of your country of residence
            require otherwise.
          </>,
          <>
            <strong>Informal resolution.</strong> Before initiating formal proceedings, you agree to
            contact {SUPPORT_EMAIL} and attempt good-faith resolution for at least thirty (30) days.
          </>,
          <>
            <strong>Arbitration / courts.</strong> Except where prohibited by mandatory law, disputes
            not resolved informally shall be submitted to binding arbitration or the competent courts
            of the Operator&apos;s jurisdiction, as specified in supplementary dispute rules we publish
            or as required by applicable law. You waive any right to participate in a class, collective,
            or representative action to the extent such waiver is enforceable.
          </>,
          <>
            <strong>Injunctive relief.</strong> Either party may seek interim injunctive relief in any
            court of competent jurisdiction to protect intellectual property or prevent unauthorised
            access.
          </>,
        ])}
      </>
    ),
  },
  {
    title: '27. Contact',
    body: (
      <>
        {p(
          'For questions regarding these Terms, fee disputes, compliance, or account enforcement, contact:'
        )}
        {p(
          <a href={`mailto:${SUPPORT_EMAIL}`} className="legal-doc-link">
            {SUPPORT_EMAIL}
          </a>
        )}
        {p(
          `${BRAND_NAME} · `,
          BRAND_DOMAIN,
          ' · ',
          BRAND_APP_URL
        )}
      </>
    ),
  },
];
