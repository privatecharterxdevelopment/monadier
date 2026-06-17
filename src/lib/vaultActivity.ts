import { formatUnits } from 'viem';
import { MONADIER_VAULT_V11_ADDRESS } from './monadierVault';

const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const ARBISCAN_TX = 'https://arbiscan.io/tx';

export type VaultActivityEntry = {
  id: string;
  type: 'deposit' | 'withdraw';
  amountUsd: number;
  timestamp: Date;
  txHash: string;
  explorerUrl: string;
};

type ArbiscanTokenTx = {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
};

export async function fetchVaultActivityForWallet(
  walletAddress: string
): Promise<VaultActivityEntry[]> {
  const wallet = walletAddress.toLowerCase();
  const vault = MONADIER_VAULT_V11_ADDRESS.toLowerCase();

  try {
    const params = new URLSearchParams({
      module: 'account',
      action: 'tokentx',
      contractaddress: USDC_ARBITRUM,
      address: wallet,
      sort: 'desc',
      page: '1',
      offset: '100',
    });
    const res = await fetch(`https://api.arbiscan.io/api?${params}`);
    const data = await res.json();
    if (data.status !== '1' || !Array.isArray(data.result)) return [];

    const entries: VaultActivityEntry[] = [];
    for (const tx of data.result as ArbiscanTokenTx[]) {
      const from = tx.from?.toLowerCase();
      const to = tx.to?.toLowerCase();
      const isDeposit = from === wallet && to === vault;
      const isWithdraw = from === vault && to === wallet;
      if (!isDeposit && !isWithdraw) continue;

      const amountUsd = Number(formatUnits(BigInt(tx.value), 6));
      if (amountUsd <= 0) continue;

      entries.push({
        id: `${tx.hash}-${isDeposit ? 'in' : 'out'}`,
        type: isDeposit ? 'deposit' : 'withdraw',
        amountUsd,
        timestamp: new Date(parseInt(tx.timeStamp, 10) * 1000),
        txHash: tx.hash,
        explorerUrl: `${ARBISCAN_TX}/${tx.hash}`,
      });
    }

    return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  } catch (e) {
    console.warn('[fetchVaultActivityForWallet]', e);
    return [];
  }
}
