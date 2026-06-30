import { createPublicClient, formatUnits, http, parseEventLogs, parseAbiItem } from 'viem';
import { arbitrum } from 'viem/chains';
import { config } from '../config';
import { logger } from '../utils/logger';

const TRANSFER_ABI = [parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')];

export async function verifyArbitrumUsdcFeePayment(opts: {
  payerWallet: string;
  treasuryAddress: string;
  minUsd: number;
  txHash: string;
}): Promise<boolean> {
  const from = opts.payerWallet.toLowerCase();
  const to = opts.treasuryAddress.toLowerCase();
  const txHash = opts.txHash.trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) return false;

  try {
    const client = createPublicClient({
      chain: arbitrum,
      transport: http(config.arbitrum.rpcUrl),
    });
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== 'success') return false;

    const transfers = parseEventLogs({
      abi: TRANSFER_ABI,
      logs: receipt.logs,
      eventName: 'Transfer',
    });

    let received = 0;
    for (const ev of transfers) {
      if (ev.address.toLowerCase() !== config.arbitrum.usdcAddress.toLowerCase()) continue;
      const args = ev.args as { from: string; to: string; value: bigint };
      if (args.from.toLowerCase() !== from || args.to.toLowerCase() !== to) continue;
      received += Number.parseFloat(formatUnits(args.value, 6));
    }

    const ok = received + 0.01 >= opts.minUsd;
    if (!ok) {
      logger.warn('platform fee arbitrum verify underpaid', {
        from: from.slice(0, 10),
        received: received.toFixed(4),
        min: opts.minUsd.toFixed(4),
        tx: txHash.slice(0, 12),
      });
    }
    return ok;
  } catch (err: unknown) {
    logger.warn('platform fee arbitrum verify failed', {
      tx: txHash.slice(0, 12),
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
