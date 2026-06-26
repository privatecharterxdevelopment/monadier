/** Footer legal copy — Monadier (real HL trading, non-custodial software). */

export type LegalDisclaimerBlock = {
  id: string;
  heading?: string;
  paragraphs: string[];
};

export const LANDING_OPERATOR_DISCLOSURE = [
  'Trading on Monadier connects your wallet to your own Hyperliquid account. Orders are placed on Hyperliquid perpetual and outcome markets using your USDC margin — this is live trading with real financial instruments, not a simulated or demo evaluation program.',
  'Monadier is a software platform operated by the Monadier team. The website monadier.com provides access to automated trading tools, dashboards, and optional sports outcome markets on Hyperliquid. For legal or compliance inquiries, contact support@monadier.com.',
];

export const LANDING_LEGAL_BLOCKS: LegalDisclaimerBlock[] = [
  {
    id: 'legal-disclosure',
    heading: 'Legal disclosure',
    paragraphs: [
      'Monadier provides software that may automate entries and exits on Hyperliquid based on configured settings and market signals. The service is designed to assist with execution and monitoring — it does not constitute a guarantee of profitability or risk-free trading.',
    ],
  },
  {
    id: 'no-custody',
    heading: 'No client fund custody',
    paragraphs: [
      'Monadier is not a broker, dealer, exchange, custodian, bank, or investment adviser. We do not accept, hold, or manage client deposits. Your USDC remains on your Hyperliquid account in your name. Deposits and withdrawals require your wallet signature; the approved trading agent may place orders but cannot withdraw funds without you.',
    ],
  },
  {
    id: 'live-trading',
    heading: 'Live trading — real risk',
    paragraphs: [
      'Unlike paper or evaluation accounts, Monadier automates real positions on Hyperliquid. You can lose part or all of your margin. Leverage amplifies gains and losses. Only use capital you can afford to lose and ensure crypto derivatives are permitted where you live.',
    ],
  },
  {
    id: 'not-advice',
    heading: 'Not investment advice',
    paragraphs: [
      'All content, signals, dashboards, and tools are provided for informational and software-access purposes only. Nothing on this site is investment, tax, or legal advice, or a solicitation to buy or sell any financial product, cryptocurrency, or derivative. Consult independent advisers before trading.',
    ],
  },
  {
    id: 'performance',
    heading: 'Performance disclosure',
    paragraphs: [
      'Past performance, win rates, backtests, or examples shown in marketing or the app are not indicative of future results. Automated strategies can fail during volatile, illiquid, or news-driven conditions. Hypothetical or simulated results have inherent limitations and may not reflect actual trading costs, slippage, or latency.',
    ],
  },
  {
    id: 'jurisdiction',
    heading: 'Jurisdictional restrictions',
    paragraphs: [
      'You must be at least 18 years old and legally permitted to use crypto derivatives in your jurisdiction. Monadier does not target users where such services are prohibited. It is your responsibility to comply with local laws, sanctions, and tax obligations. Access may be restricted or terminated where required by law.',
    ],
  },
  {
    id: 'risk',
    heading: 'Risk warning',
    paragraphs: [
      'Trading perpetual futures, leveraged crypto, and on-chain outcome markets involves substantial risk of loss. Markets can gap, liquidate positions, or become temporarily unavailable. Smart-contract, bridge, wallet, and third-party protocol risks apply. Hyperliquid is a separate platform governed by its own terms.',
    ],
  },
  {
    id: 'fees',
    heading: 'Fees & refunds',
    paragraphs: [
      'Hyperliquid protocol and network fees apply to each trade. Monadier may charge subscription, builder, or success-based fees as disclosed in the app before purchase. Software access fees are for platform use unless otherwise stated; trading losses are not refundable. See Terms of Service for current fee schedules.',
    ],
  },
];

export const LANDING_LEGAL_TAGLINE =
  'Not a bank deposit · Not FDIC or government insured · You may lose all invested capital';
