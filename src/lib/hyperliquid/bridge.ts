import { encodeFunctionData, erc20Abi, parseUnits, type WalletClient } from 'viem';
import { arbitrum } from 'viem/chains';
import { HL_MIN_DEPOSIT_USDC } from './hlApp';

export const HL_BRIDGE_ADDRESS = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7' as const;
export const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;
export const HL_ARBITRUM_CHAIN_ID = 42161;

export { HL_MIN_DEPOSIT_USDC };

export async function depositUsdcToHyperliquid(
  walletClient: WalletClient,
  amountUsdc: string
): Promise<`0x${string}`> {
  const amount = parseUnits(amountUsdc, 6);
  if (amount < parseUnits(String(HL_MIN_DEPOSIT_USDC), 6)) {
    throw new Error(`Minimum deposit is ${HL_MIN_DEPOSIT_USDC} USDC`);
  }
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');

  const chainId = walletClient.chain?.id;
  if (chainId != null && chainId !== HL_ARBITRUM_CHAIN_ID) {
    throw new Error('Switch wallet to Arbitrum to deposit to Hyperliquid');
  }

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [HL_BRIDGE_ADDRESS, amount],
  });

  const hash = await walletClient.sendTransaction({
    account,
    chain: walletClient.chain ?? arbitrum,
    to: ARBITRUM_USDC,
    data,
  });
  return hash;
}
