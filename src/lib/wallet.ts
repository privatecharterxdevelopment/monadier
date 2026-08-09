import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createStorage } from '@wagmi/core';
import { arbitrum } from '@reown/appkit/networks';
import { BRAND_NAME } from './brand';
import { MONADIER_REOWN_PROJECT_ID } from './mobileWalletConnect';
import { HL_DEPOSIT_CHAIN_LABEL, HL_DEPOSIT_TOKEN } from './hlDepositRules';
import { HL_ARBITRUM_CHAIN_ID } from './hyperliquid/bridge';
import { USDC_ADDRESSES } from './usdcArbitrum';

const envProjectId =
  import.meta.env.VITE_REOWN_PROJECT_ID ||
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  MONADIER_REOWN_PROJECT_ID ||
  '';

const PLACEHOLDER_PROJECT_ID = '00000000000000000000000000000000';

export const hasWalletProjectId = Boolean(
  envProjectId && !envProjectId.includes('your-') && envProjectId !== 'YOUR_PROJECT_ID'
);

/** Always set — AppKit hooks throw if createAppKit was never called */
export const projectId = hasWalletProjectId ? envProjectId : PLACEHOLDER_PROJECT_ID;

const getOrigin = () => {
  if (typeof window === 'undefined') return 'http://localhost:5173';
  return window.location.origin;
};

const metadata = {
  name: BRAND_NAME,
  description: `${HL_DEPOSIT_TOKEN} on ${HL_DEPOSIT_CHAIN_LABEL} — fund Hyperliquid & run the ${BRAND_NAME} bot`,
  url: getOrigin(),
  icons: [`${getOrigin()}/favicon.svg`],
};

/** MetaMask — featured first on mobile WalletConnect list. */
const METAMASK_WALLET_ID = 'c57ca95c075bbc3f4656fe7880bb88e88080e207664';
/** Phantom — poor Arbitrum/HL UX; hide from Connect list (WalletConnect Explorer id). */
const PHANTOM_WALLET_ID = 'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393';

/** Bot + HL funding: Arbitrum One only — avoids wrong-network deposits. */
const networks = [arbitrum];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
  storage: createStorage({
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
  }),
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: hasWalletProjectId,
    email: false,
    socials: false,
    allWallets: true,
  },
  enableWalletConnect: hasWalletProjectId,
  enableMobileWalletLink: true,
  enableInjected: true,
  featuredWalletIds: [METAMASK_WALLET_ID],
  excludeWalletIds: [PHANTOM_WALLET_ID],
  /** Show Arbitrum USDC in AppKit account view (fallback if custom sheet not used). */
  tokens: {
    [`eip155:${HL_ARBITRUM_CHAIN_ID}`]: {
      address: USDC_ADDRESSES[HL_ARBITRUM_CHAIN_ID],
      image: `${getOrigin()}/images/partners/usdc.svg`,
    },
  },
  themeMode: 'light',
  themeVariables: {
    '--w3m-accent': '#0a0a0a',
    '--w3m-color-mix': '#e8e8ec',
    '--w3m-color-mix-strength': 0,
    '--w3m-border-radius-master': '8px',
    '--w3m-font-family': 'inherit',
  },
});

export const config = wagmiAdapter.wagmiConfig;

if (!hasWalletProjectId && import.meta.env.PROD) {
  console.error(
    'WalletConnect project id missing — mobile MetaMask will not work. Set VITE_REOWN_PROJECT_ID on Vercel.'
  );
}
