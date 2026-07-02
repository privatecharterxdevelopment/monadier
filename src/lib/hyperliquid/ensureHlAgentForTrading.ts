import type { WalletClient } from 'viem';
import {
  approveAndSaveHlBotAgent,
  fetchHlAgentAddress,
  resolveHlAgentApproval,
} from './hlBotAgent';

/** One-time approveAgent (Arbitrum) so Monadier can sign HL L1 orders server-side. */
export async function ensureHlAgentForTrading(walletClient: WalletClient): Promise<void> {
  const address = walletClient.account?.address;
  if (!address) throw new Error('Connect wallet first');

  const meta = await fetchHlAgentAddress(address);
  if (!meta.success || !meta.agentAddress) {
    throw new Error(meta.error || 'Could not load trading agent');
  }

  const approval = await resolveHlAgentApproval(address, meta.agentAddress);
  if (approval.approved) return;

  await approveAndSaveHlBotAgent({
    walletClient,
    walletAddress: address,
    agentAddress: meta.agentAddress,
    agentName: meta.agentName,
    expiresAt: meta.expiresAt,
  });
}
