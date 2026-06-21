import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createStorage } from '@wagmi/core';
import { mainnet, arbitrum, polygon, base, bsc } from '@reown/appkit/networks';
import { MONADIER_REOWN_PROJECT_ID } from './mobileWalletConnect';

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
  if (typeof window === 'undefined') return 'https://app.monadier.com';
  return window.location.origin;
};

const metadata = {
  name: 'Monadier',
  description: 'Decentralized Trading Platform',
  url: getOrigin(),
  icons: [`${getOrigin()}/favicon.svg`],
};

/** MetaMask — featured first on mobile WalletConnect list. */
const METAMASK_WALLET_ID = 'c57ca95c075bbc3f4656fe7880bb88e88080e207664';

const networks = [arbitrum, base, mainnet, bsc, polygon];

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
