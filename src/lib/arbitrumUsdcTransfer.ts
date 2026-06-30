import { encodeFunctionData, erc20Abi, formatUnits, parseUnits, type PublicClient, type WalletClient } from 'viem';
import { arbitrum } from 'viem/chains';
import { ARBITRUM_USDC, HL_ARBITRUM_CHAIN_ID } from './hyperliquid/bridge';

export async function fetchArbitrumUsdcBalance(
  publicClient: PublicClient,
  wallet: `0x${string}`
): Promise<number> {
  const raw = await publicClient.readContract({
    address: ARBITRUM_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [wallet],
  });
  return Number.parseFloat(formatUnits(raw, 6));
}

export async function transferArbitrumUsdc(
  walletClient: WalletClient,
  to: `0x${string}`,
  amountUsd: number
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');

  const chainId = walletClient.chain?.id;
  if (chainId != null && chainId !== HL_ARBITRUM_CHAIN_ID) {
    throw new Error('Switch wallet to Arbitrum One to pay platform fees');
  }

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error('Invalid payment amount');
  }

  const amount = parseUnits(amountUsd.toFixed(6), 6);
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amount],
  });

  return walletClient.sendTransaction({
    account,
    chain: walletClient.chain ?? arbitrum,
    to: ARBITRUM_USDC,
    data,
  });
}
