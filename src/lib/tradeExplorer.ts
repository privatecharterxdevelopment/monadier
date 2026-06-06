const EXPLORERS: Record<number, string> = {
  42161: 'https://arbiscan.io',
  8453: 'https://basescan.org',
  1: 'https://etherscan.io',
  137: 'https://polygonscan.com',
};

export function explorerBase(chainId: number): string {
  return EXPLORERS[chainId] || EXPLORERS[42161];
}

export function explorerTxUrl(chainId: number, txHash: string): string {
  return `${explorerBase(chainId)}/tx/${txHash}`;
}

export function explorerAddressUrl(chainId: number, address: string): string {
  return `${explorerBase(chainId)}/address/${address}`;
}
