import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, arbitrum, polygon, base, bsc } from '@reown/appkit/networks';

// Get project ID from https://cloud.reown.com
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'YOUR_PROJECT_ID';

const metadata = {
  name: 'Monadier',
  description: 'Decentralized Trading Platform',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://monadier.com',
  icons: ['https://monadier.com/icon.png']
};

// All supported networks
const networks = [mainnet, bsc, arbitrum, base, polygon];

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
    socials: false
  },
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
