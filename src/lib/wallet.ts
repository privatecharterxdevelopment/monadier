import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, arbitrum, polygon, base, bsc } from '@reown/appkit/networks';

// Get project ID from https://cloud.reown.com
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'YOUR_PROJECT_ID';

// Get current origin for metadata
const getOrigin = () => {
  if (typeof window === 'undefined') return 'https://monadier.com';
  return window.location.origin;
};

const metadata = {
  name: 'Monadier',
  description: 'Decentralized Trading Platform',
  url: getOrigin(),
  icons: [`${getOrigin()}/favicon.svg`]
};

// All supported networks - Arbitrum first (default for V7)
const networks = [arbitrum, base, mainnet, bsc, polygon];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: true,
    email: false,
    socials: false,
    // Enable all wallet options for mobile
    allWallets: true
  },
  // Mobile wallet handling
  enableWalletConnect: true,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#ffffff',
    '--w3m-color-mix': '#1a1a1a',
    '--w3m-color-mix-strength': 0,
    '--w3m-border-radius-master': '8px',
    '--w3m-font-family': 'inherit'
  }
});

export const config = wagmiAdapter.wagmiConfig;
