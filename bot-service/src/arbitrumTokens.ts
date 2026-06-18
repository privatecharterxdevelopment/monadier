/** Arbitrum token addresses for MTF signal analysis (not execution venue). */
export const ARBITRUM_SIGNAL_TOKENS = {
  WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as `0x${string}`,
  WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as `0x${string}`,
  ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548' as `0x${string}`,
} as const;

export const TRADE_TOKENS: Record<number, { address: `0x${string}`; symbol: string }[]> = {
  42161: [
    { address: ARBITRUM_SIGNAL_TOKENS.WETH, symbol: 'WETH' },
    { address: ARBITRUM_SIGNAL_TOKENS.WBTC, symbol: 'WBTC' },
    { address: ARBITRUM_SIGNAL_TOKENS.ARB, symbol: 'ARB' },
  ],
  8453: [],
  1: [],
  137: [],
  56: [],
};
