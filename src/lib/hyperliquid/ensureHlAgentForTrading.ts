import type { WalletClient } from 'viem';
import {
  approveAndSaveHlBotAgent,
  fetchHlAgentAddress,
  resolveHlAgentApproval,
} from './hlBotAgent';
import { hlAgentNeedsRenew } from './hlAgentExpiry';

/**
 * Ensure trading agent is approved on Hyperliquid.
 * Re-prompts MetaMask when missing, expired, or inside the renew window (~14d).
 */
export async function ensureHlAgentForTrading(walletClient: WalletClient): Promise<void> {
  const address = walletClient.account?.address;
  if (!address) throw new Error('Connect wallet first');

  const meta = await fetchHlAgentAddress(address);
  if (!meta.success || !meta.agentAddress) {
    throw new Error(meta.error || 'Could not load trading agent');
  }

  const approval = await resolveHlAgentApproval(address, meta.agentAddress);
  const needsRenew = hlAgentNeedsRenew(approval.approved, approval.expiresAt);
  if (!needsRenew) return;

  await approveAndSaveHlBotAgent({
    walletClient,
    walletAddress: address,
    agentAddress: meta.agentAddress,
    agentName: meta.agentName,
    expiresAt: meta.expiresAt,
    forceRenew: true,
  });
}
