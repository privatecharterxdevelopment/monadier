import { createPublicClient, formatUnits, http, parseEventLogs, parseAbiItem } from 'viem';
import { arbitrum } from 'viem/chains';
import { config } from '../config';
import { logger } from '../utils/logger';

const TRANSFER_ABI = [parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')];

export type ArbitrumUsdcTransfer = {
  from: string;
  to: string;
  amountUsd: number;
  txHash: string;
};

export async function parseArbitrumUsdcTransfer(txHash: string): Promise<ArbitrumUsdcTransfer | null> {
  const hash = txHash.trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(hash)) return null;

  try {
    const client = createPublicClient({
      chain: arbitrum,
      transport: http(config.arbitrum.rpcUrl),
    });
    const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
    if (receipt.status !== 'success') return null;

    const transfers = parseEventLogs({
      abi: TRANSFER_ABI,
      logs: receipt.logs,
      eventName: 'Transfer',
    });

    const treasury = config.platformFeeTreasuryAddress?.toLowerCase() ?? '';
    const usdc = config.arbitrum.usdcAddress.toLowerCase();

    for (const ev of transfers) {
      if (ev.address.toLowerCase() !== usdc) continue;
      const args = ev.args as { from: string; to: string; value: bigint };
      if (treasury && args.to.toLowerCase() !== treasury) continue;
      return {
        from: args.from.toLowerCase(),
        to: args.to.toLowerCase(),
        amountUsd: Number.parseFloat(formatUnits(args.value, 6)),
        txHash: hash,
      };
    }
    return null;
  } catch (err: unknown) {
    logger.warn('parseArbitrumUsdcTransfer failed', {
      tx: hash.slice(0, 12),
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function verifyArbitrumUsdcFeePayment(opts: {
  payerWallet: string;
  treasuryAddress: string;
  minUsd: number;
  txHash: string;
}): Promise<boolean> {
  const transfer = await parseArbitrumUsdcTransfer(opts.txHash);
  if (!transfer) return false;

  const from = opts.payerWallet.toLowerCase();
  const to = opts.treasuryAddress.toLowerCase();
  if (transfer.from !== from || transfer.to !== to) return false;
  return transfer.amountUsd + 0.01 >= opts.minUsd;
}

/** Treasury receipt — payer can be any linked wallet (admin reconcile). */
export async function verifyArbitrumUsdcTreasuryReceipt(opts: {
  treasuryAddress: string;
  minUsd: number;
  txHash: string;
  allowedPayers?: string[];
}): Promise<{ ok: boolean; transfer: ArbitrumUsdcTransfer | null }> {
  const transfer = await parseArbitrumUsdcTransfer(opts.txHash);
  if (!transfer) return { ok: false, transfer: null };

  const to = opts.treasuryAddress.toLowerCase();
  if (transfer.to !== to) return { ok: false, transfer };

  const allowed = opts.allowedPayers?.map((w) => w.toLowerCase()) ?? [];
  if (allowed.length > 0 && !allowed.includes(transfer.from)) {
    return { ok: false, transfer };
  }

  const ok = transfer.amountUsd + 0.01 >= opts.minUsd;
  return { ok, transfer };
}
