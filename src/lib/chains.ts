// Supported chains configuration
export interface ChainConfig {
  id: number;
  name: string;
  shortName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrl: string;
  blockExplorer: string;
  icon: string;
  dex: {
    name: string;
    routerAddress: string;
    factoryAddress: string;
    type: 'uniswap-v2' | 'uniswap-v3' | 'jupiter';
  };
  tokens: {
    usdt?: string;
    usdc?: string;
    weth?: string;
    wnative: string;
  };
}

// ARBITRUM ONLY - Single chain support
export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    id: 42161,
    name: 'Arbitrum',
    shortName: 'ARB',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    blockExplorer: 'https://arbiscan.io',
    icon: '/chains/arbitrum.svg',
    dex: {
      name: 'Uniswap V3',
      routerAddress: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      factoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      type: 'uniswap-v3'
    },
    tokens: {
      usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      wnative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
    }
  }
];

// Solana config (separate because it's not EVM)
export const SOLANA_CONFIG = {
  name: 'Solana',
  shortName: 'SOL',
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  blockExplorer: 'https://solscan.io',
  icon: '/chains/solana.svg',
  dex: {
    name: 'Jupiter',
    apiUrl: 'https://quote-api.jup.ag/v6'
  },
  tokens: {
    usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    usdt: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    sol: 'So11111111111111111111111111111111111111112'
  }
};

// Testnet chains
export const TESTNET_CHAINS: ChainConfig[] = [
  {
    id: 97,
    name: 'BSC Testnet',
    shortName: 'tBSC',
    nativeCurrency: { name: 'Test BNB', symbol: 'tBNB', decimals: 18 },
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    blockExplorer: 'https://testnet.bscscan.com',
    icon: '/chains/bnb.svg',
    dex: {
      name: 'PancakeSwap (Testnet)',
      routerAddress: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
      factoryAddress: '0x6725F303b657a9451d8BA641348b6761A6CC7a17',
      type: 'uniswap-v2'
    },
    tokens: {
      usdt: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
      usdc: '0x64544969ed7EBf5f083679233325356EbE738930',
      wnative: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd'
    }
  }
];

// Average gas costs - Arbitrum only
export const CHAIN_GAS_ESTIMATES: Record<number, { swapGas: number; approveGas: number; avgGasPrice: number }> = {
  42161: { swapGas: 500000, approveGas: 100000, avgGasPrice: 0.1 }, // Arbitrum - very cheap
};

export const isTestnet = (chainId: number): boolean => {
  return TESTNET_CHAINS.some(chain => chain.id === chainId);
};

export const getAllChains = (includeTestnets: boolean = false): ChainConfig[] => {
  return includeTestnets ? [...SUPPORTED_CHAINS, ...TESTNET_CHAINS] : SUPPORTED_CHAINS;
};

export const getChainById = (chainId: number): ChainConfig | undefined => {
  return SUPPORTED_CHAINS.find(chain => chain.id === chainId) ||
         TESTNET_CHAINS.find(chain => chain.id === chainId);
};

export const getChainByName = (name: string): ChainConfig | undefined => {
  return SUPPORTED_CHAINS.find(
    chain => chain.name.toLowerCase() === name.toLowerCase() ||
             chain.shortName.toLowerCase() === name.toLowerCase()
  );
};
