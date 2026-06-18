import { keccak256, toBytes } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { config } from '../config';

const AGENT_NAME_MAX = 16;

export function agentNameForUser(userAddress: string): string {
  const validityMs = config.hyperliquid.agentValidityDays * 24 * 60 * 60 * 1000;
  const validUntil = Date.now() + validityMs;
  const base = config.hyperliquid.agentName.slice(0, AGENT_NAME_MAX);
  return `${base} valid_until ${validUntil}`;
}

export function agentExpiresAt(): string {
  const validityMs = config.hyperliquid.agentValidityDays * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + validityMs).toISOString();
}

/** Deterministic per-user HL agent — user approves this address once on Hyperliquid. */
export function deriveUserHlAgent(userAddress: string): PrivateKeyAccount {
  const seed = keccak256(
    toBytes(
      `${config.hyperliquid.agentMasterSecret}:hl-agent:${userAddress.toLowerCase()}`
    )
  );
  return privateKeyToAccount(seed);
}

export function deriveUserHlAgentAddress(userAddress: string): `0x${string}` {
  return deriveUserHlAgent(userAddress).address;
}
