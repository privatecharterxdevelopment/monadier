import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, arbitrum, polygon, base, bsc } from '@reown/appkit/networks';

// Get project ID from https://cloud.reown.com
const envProjectId =
  import.meta.env.VITE_REOWN_PROJECT_ID ||
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  '';

const PLACEHOLDER_PROJECT_ID = '00000000000000000000000000000000';

export const hasWalletProjectId = Boolean(
  envProjectId && !envProjectId.includes('your-') && envProjectId !== 'YOUR_PROJECT_ID'
);

/** Always set — AppKit hooks throw if createAppKit was never called */
export const projectId = hasWalletProjectId ? envProjectId : PLACEHOLDER_PROJECT_ID;

// Get current origin for metadata
const getOrigin = () => {
  if (typeof window === 'undefined') return 'https://monadier.com';
  return window.location.origin;
};

const metadata = {
  name: 'Monadier',
  description: 'Decentralized Trading Platform',
  url: getOrigin(),
  icons: [`${getOrigin()}/favicon.svg`],
};

// All supported networks - Arbitrum first (default for V7)
const networks = [arbitrum, base, mainnet, bsc, polygon];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
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
  themeMode: 'light',
  themeVariables: {
    '--w3m-accent': '#0a0a0a',
    '--w3m-color-mix': '#e8e8ec',
    '--w3m-color-mix-strength': 0,
    '--w3m-border-radius-master': '8px',
    '--w3m-font-family': 'inherit',
  },
});

if (!hasWalletProjectId && import.meta.env.DEV) {
  console.warn(
    'WalletConnect uses a placeholder project ID — set VITE_REOWN_PROJECT_ID in .env.local for full wallet modal (https://cloud.reown.com).'
  );
}

export const config = wagmiAdapter.wagmiConfig;
