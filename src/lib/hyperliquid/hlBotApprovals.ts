import type { WalletClient } from 'viem';
import { createHlExchangeClient } from './exchange';
import { fetchMaxBuilderFee, isBuilderApprovalSufficient } from './builder';
import { getHlBuilderConfig } from './builderConfig';
import {
  fetchHlBuilderPlatformStatus,
  isBuilderPlatformError,
} from './builderPlatform';
import {
  approveAndSaveHlBotAgent,
  fetchHlAgentAddress,
  findActiveHlAgent,
} from './hlBotAgent';

export type HlBotApprovalResult = {
  agentSigned: boolean;
  builderFeeSigned: boolean;
};

const BUILDER_VERIFY_ATTEMPTS = 10;
const BUILDER_VERIFY_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read maxBuilderFee from Hyperliquid — source of truth for fee approval. */
export async function verifyHlBuilderFeeOnChain(walletAddress: string): Promise<boolean> {
  const config = getHlBuilderConfig();
  if (!config.enabled) return true;

  const platform = await fetchHlBuilderPlatformStatus();
  if (!platform.ready) return false;

  const max = await fetchMaxBuilderFee(walletAddress, config.address);
  return isBuilderApprovalSufficient(max);
}

/** Sign + verify platform fee on HL. Throws if still not approved on-chain. */
export async function approveHlBuilderFeeRequired(
  walletClient: WalletClient,
  walletAddress: string
): Promise<void> {
  const config = getHlBuilderConfig();
  if (!config.enabled) return;

  const platform = await fetchHlBuilderPlatformStatus();
  if (!platform.ready) {
    throw new Error(
      'Platform fee is not active yet — wait a minute and try Approve platform fee again.'
    );
  }

  if (await verifyHlBuilderFeeOnChain(walletAddress)) return;

  const client = createHlExchangeClient(walletClient);
  try {
    await client.approveBuilderFee({
      builder: config.address,
      maxFeeRate: config.maxApprovalRate,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isBuilderPlatformError(msg)) {
      throw new Error(
        'Platform fee could not be approved — Monadier builder wallet may still be funding. Try again shortly.'
      );
    }
    throw err;
  }

  for (let i = 0; i < BUILDER_VERIFY_ATTEMPTS; i++) {
    if (await verifyHlBuilderFeeOnChain(walletAddress)) return;
    await sleep(BUILDER_VERIFY_DELAY_MS);
  }

  throw new Error(
    'Platform fee not detected on Hyperliquid. Confirm the fee approval signature in your wallet (separate from the trading agent), then try again.'
  );
}

/** @deprecated Use approveHlBuilderFeeRequired — never skip silently. */
export async function approveHlBuilderFeeIfNeeded(
  walletClient: WalletClient,
  walletAddress: string
): Promise<boolean> {
  const before = await verifyHlBuilderFeeOnChain(walletAddress);
  if (before) return false;
  await approveHlBuilderFeeRequired(walletClient, walletAddress);
  return true;
}

export async function approveHlBotAgentRequired(opts: {
  walletClient: WalletClient;
  walletAddress: string;
  userId?: string;
}): Promise<boolean> {
  const { walletClient, walletAddress } = opts;

  const meta = await fetchHlAgentAddress(walletAddress);
  if (!meta.success || !meta.agentAddress) {
    throw new Error(meta.error || 'Could not load agent address');
  }

  const hadAgent = Boolean(
    await findActiveHlAgent(walletAddress, meta.agentAddress)
  );
  if (hadAgent) return false;

  await approveAndSaveHlBotAgent({
    walletClient,
    walletAddress,
    agentAddress: meta.agentAddress,
    agentName: meta.agentName || 'monadier',
    expiresAt: meta.expiresAt ?? null,
    userId: opts.userId,
  });
  return true;
}

/**
 * One-time bot setup: trading agent then platform success fee (auto-chained).
 * Closes after this never prompt for fees — 10% is taken on profitable exits via HL builder.
 */
export async function completeHlBotApprovals(opts: {
  walletClient: WalletClient;
  walletAddress: string;
  userId?: string;
}): Promise<HlBotApprovalResult> {
  const agentSigned = await approveHlBotAgentRequired(opts);
  const builderConfig = getHlBuilderConfig();
  if (!builderConfig.enabled) {
    return { agentSigned, builderFeeSigned: false };
  }
  const beforeFee = await verifyHlBuilderFeeOnChain(opts.walletAddress);
  if (!beforeFee) {
    await approveHlBuilderFeeRequired(opts.walletClient, opts.walletAddress);
  }
  const builderFeeSigned = !beforeFee;
  return { agentSigned, builderFeeSigned };
}
