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

export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    id: 1,
    name: 'Ethereum',
    shortName: 'ETH',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://eth.llamarpc.com',
    blockExplorer: 'https://etherscan.io',
    icon: '/chains/ethereum.svg',
    dex: {
      name: 'Uniswap V3',
      routerAddress: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      factoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      type: 'uniswap-v3'
    },
    tokens: {
      usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      wnative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    }
  },
  {
    id: 56,
    name: 'BNB Chain',
    shortName: 'BSC',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrl: 'https://bsc-dataseed.binance.org',
    blockExplorer: 'https://bscscan.com',
    icon: '/chains/bnb.svg',
    dex: {
      name: 'PancakeSwap',
      routerAddress: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      factoryAddress: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
      type: 'uniswap-v2'
    },
    tokens: {
      usdt: '0x55d398326f99059fF775485246999027B3197955',
      usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      wnative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
    }
  },
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
  },
  {
    id: 8453,
    name: 'Base',
    shortName: 'BASE',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
    icon: '/chains/base.svg',
    dex: {
      name: 'Uniswap V3',
      routerAddress: '0x2626664c2603336E57B271c5C0b26F421741e481',
      factoryAddress: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
      type: 'uniswap-v3'
    },
    tokens: {
      usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      weth: '0x4200000000000000000000000000000000000006',
      wnative: '0x4200000000000000000000000000000000000006'
    }
  },
  {
    id: 137,
    name: 'Polygon',
    shortName: 'MATIC',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrl: 'https://polygon-rpc.com',
    blockExplorer: 'https://polygonscan.com',
    icon: '/chains/polygon.svg',
    dex: {
      name: 'Uniswap V3',
      routerAddress: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      factoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      type: 'uniswap-v3'
    },
    tokens: {
      usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      weth: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      wnative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
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

// Average gas costs per chain (in native token)
export const CHAIN_GAS_ESTIMATES: Record<number, { swapGas: number; approveGas: number; avgGasPrice: number }> = {
  1: { swapGas: 150000, approveGas: 46000, avgGasPrice: 30 }, // Ethereum - expensive
  56: { swapGas: 150000, approveGas: 46000, avgGasPrice: 3 }, // BSC - cheap
  42161: { swapGas: 500000, approveGas: 100000, avgGasPrice: 0.1 }, // Arbitrum - very cheap
  8453: { swapGas: 150000, approveGas: 46000, avgGasPrice: 0.05 }, // Base - very cheap
  137: { swapGas: 200000, approveGas: 50000, avgGasPrice: 50 }, // Polygon - cheap in MATIC
  97: { swapGas: 150000, approveGas: 46000, avgGasPrice: 10 } // BSC testnet
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
