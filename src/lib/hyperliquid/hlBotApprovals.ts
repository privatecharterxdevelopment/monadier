import type { WalletClient } from 'viem';
import { createHlExchangeClient } from './exchange';
import { fetchMaxBuilderFee, isBuilderApprovalSufficient } from './builder';
import { getHlBuilderConfig } from './builderConfig';
import {
  approveAndSaveHlBotAgent,
  fetchHlAgentAddress,
  findActiveHlAgent,
} from './hlBotAgent';

export type HlBotApprovalResult = {
  agentSigned: boolean;
  builderFeeSigned: boolean;
};

/** One-time HL platform fee — required on bot orders when builder is enabled. */
export async function approveHlBuilderFeeIfNeeded(
  walletClient: WalletClient,
  walletAddress: string
): Promise<boolean> {
  const config = getHlBuilderConfig();
  if (!config.enabled) return false;

  const max = await fetchMaxBuilderFee(walletAddress, config.address);
  if (isBuilderApprovalSufficient(max)) return false;

  const client = createHlExchangeClient(walletClient);
  await client.approveBuilderFee({
    builder: config.address,
    maxFeeRate: config.maxApprovalRate,
  });
  return true;
}

/**
 * Agent + platform fee in one flow (1–2 wallet signatures).
 * Same approvals as manual Pro Trade — bundled for the bot panel.
 */
export async function completeHlBotApprovals(opts: {
  walletClient: WalletClient;
  walletAddress: string;
}): Promise<HlBotApprovalResult> {
  const { walletClient, walletAddress } = opts;

  const meta = await fetchHlAgentAddress(walletAddress);
  if (!meta.success || !meta.agentAddress) {
    throw new Error(meta.error || 'Could not load agent address');
  }

  const hadAgent = Boolean(
    await findActiveHlAgent(walletAddress, meta.agentAddress)
  );

  await approveAndSaveHlBotAgent({
    walletClient,
    walletAddress,
    agentAddress: meta.agentAddress,
    agentName: meta.agentName || 'monadier',
    expiresAt: meta.expiresAt ?? null,
  });

  const builderFeeSigned = await approveHlBuilderFeeIfNeeded(walletClient, walletAddress);

  return {
    agentSigned: !hadAgent,
    builderFeeSigned,
  };
}
