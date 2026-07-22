/** Footer legal copy — HyperGain (real HL trading, non-custodial software). */

import { BRAND_NAME, BRAND_DOMAIN, SUPPORT_EMAIL, OFFICIAL_X_HANDLE, OFFICIAL_TELEGRAM_HANDLE, OFFICIAL_TELEGRAM_URL } from '../lib/brand';

export type LegalDisclaimerBlock = {
  id: string;
  heading?: string;
  paragraphs: string[];
};

export const LANDING_OPERATOR_DISCLOSURE = [
  `Trading on ${BRAND_NAME} connects your wallet to your own Hyperliquid account. Orders are placed on Hyperliquid perpetual and outcome markets using your USDC margin — this is live trading with real financial instruments, not a simulated or demo evaluation program.`,
  `${BRAND_NAME} was founded, created, and developed by Lorenzo Vanza (PrivateCharterX). The website ${BRAND_DOMAIN} provides access to automated trading tools, dashboards, and optional sports outcome markets on Hyperliquid. Full operational and legal responsibility is currently carried privately by Lorenzo Vanza, who acknowledges that he is presently overwhelmed by the product. Official X/Twitter: @${OFFICIAL_X_HANDLE}. Official Telegram (only): @${OFFICIAL_TELEGRAM_HANDLE} (${OFFICIAL_TELEGRAM_URL}). Any other social account is not official. For legal or compliance inquiries, contact ${SUPPORT_EMAIL}.`,
];

export const LANDING_LEGAL_BLOCKS: LegalDisclaimerBlock[] = [
  {
    id: 'legal-disclosure',
    heading: 'Legal disclosure',
    paragraphs: [
      `${BRAND_NAME} provides software that may automate entries and exits on Hyperliquid based on configured settings and market signals. The service is designed to assist with execution and monitoring — it does not constitute a guarantee of profitability or risk-free trading.`,
    ],
  },
  {
    id: 'no-promised-returns',
    heading: 'No promised or guaranteed returns',
    paragraphs: [
      `Nothing on ${BRAND_DOMAIN}, in the app, in marketing materials, or in support communications constitutes a promise, projection, or guarantee of profit, yield, or any specific trading outcome. Crypto and leveraged derivatives are speculative. You may lose some or all of your margin. Examples, win rates, backtests, and past bot performance are illustrative only and are not indicative of future results.`,
      'Returns vary by market conditions, leverage, fees, slippage, latency, and user settings. Automated systems can misread markets, fail during volatility, or stop operating due to technical issues. You alone bear the financial risk of every trade.',
    ],
  },
  {
    id: 'country-responsibility',
    heading: 'Country-specific responsibility',
    paragraphs: [
      'You are solely responsible for determining whether your use of HyperGain, Hyperliquid, crypto derivatives, automated trading bots, sports outcome markets, or related services is permitted in your country or region of residence, citizenship, or access.',
      'Residents of India and other jurisdictions with specific crypto, derivatives, or gambling tax and reporting rules must comply with their local laws — including income tax, GST, TDS, or equivalent obligations. HyperGain does not provide tax advice and does not file returns on your behalf.',
      'If automated trading, leveraged crypto, or prediction markets are restricted or prohibited where you live, you must not use the service. Accessing HyperGain via VPN, proxy, or location masking to circumvent restrictions is prohibited (see Terms of Service). We accept no liability for unlawful use.',
    ],
  },
  {
    id: 'vpn-policy',
    heading: 'VPN & location masking',
    paragraphs: [
      `Use of VPNs, proxies, Tor, or similar tools to access ${BRAND_NAME} while concealing your true location is against our policies when done to bypass geographic restrictions, compliance controls, or account enforcement.`,
      `${BRAND_NAME} does not accept liability for losses, account actions, regulatory exposure, or tax consequences arising from VPN or proxy use. We may detect circumvention attempts and suspend or permanently terminate accounts without refund of accrued platform fees or unused software access.`,
    ],
  },
  {
    id: 'no-custody',
    heading: 'No client fund custody',
    paragraphs: [
      `${BRAND_NAME} is not a broker, dealer, exchange, custodian, bank, or investment adviser. We do not accept, hold, or manage client deposits. Your USDC remains on your Hyperliquid account in your name. Deposits and withdrawals require your wallet signature; the approved trading agent may place orders but cannot withdraw funds without you.`,
    ],
  },
  {
    id: 'live-trading',
    heading: 'Live trading — real risk',
    paragraphs: [
      `Unlike paper or evaluation accounts, ${BRAND_NAME} automates real positions on Hyperliquid. You can lose part or all of your margin. Leverage amplifies gains and losses. Only use capital you can afford to lose and ensure crypto derivatives are permitted where you live.`,
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
      `You must be at least 18 years old and legally permitted to use crypto derivatives in your jurisdiction. ${BRAND_NAME} does not target users where such services are prohibited. It is your responsibility to comply with local laws, sanctions, and tax obligations. Access may be restricted or terminated where required by law.`,
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
      'Hyperliquid protocol and network fees apply to each trade. HyperGain may charge success-based platform fees on profitable closes, builder fees, or other charges as disclosed in the app. Unpaid accrued platform fees may block new bot opens and in-app Hyperliquid withdrawals until settled. See Terms of Service for the current fee schedule and enforcement rules.',
    ],
  },
];

export const LANDING_LEGAL_TAGLINE =
  'Not a bank deposit · Not FDIC or government insured · No guaranteed returns · You may lose all invested capital';
