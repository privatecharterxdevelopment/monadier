import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import type { WalletClient } from 'viem';
import { walletClientToHlWallet } from './walletAdapter';
import { getBotApiBase } from '../signalService';
import { supabase } from '../supabase';
import {
  fetchHlExtraAgents,
  isHlExtraAgentActive,
  type HlExtraAgent,
} from './user';

const transport = new HttpTransport();
const AGENT_NAME_MAX = 16;

export const MIN_HL_BOT_USD = 20;
export const HL_AGENT_NAME = 'monadier';

function pickHlAgentName(
  existing: HlExtraAgent[],
  agentAddress: string,
  preferred = HL_AGENT_NAME
): string {
  const addr = agentAddress.toLowerCase();
  const ours = existing.find((a) => a.address.toLowerCase() === addr);
  if (ours) return ours.name.slice(0, AGENT_NAME_MAX);
  const monadier = existing.find((a) => a.name.toLowerCase().startsWith('monadier'));
  if (monadier) return monadier.name.slice(0, AGENT_NAME_MAX);
  return preferred.slice(0, AGENT_NAME_MAX);
}

export async function findActiveHlAgent(
  wallet: string,
  agentAddress: string
): Promise<HlExtraAgent | null> {
  const agents = await fetchHlExtraAgents(wallet);
  return (
    agents.find(
      (a) =>
        a.address.toLowerCase() === agentAddress.toLowerCase() && isHlExtraAgentActive(a)
    ) ?? null
  );
}

function formatHlAgentApproveError(err: unknown, agents: HlExtraAgent[]): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (!/extra agent already used|agent already/i.test(msg)) return msg;
  if (agents.length >= 4) {
    return 'Hyperliquid allows up to 4 API wallets. Revoke an unused key at app.hyperliquid.xyz → More → API, then try again in Monadier.';
  }
  return 'This API wallet slot is already in use on Hyperliquid. Open app.hyperliquid.xyz → More → API, revoke an old Monadier or unused key, then approve again.';
}

export type HlAgentAddressResponse = {
  success: boolean;
  wallet?: string;
  agentAddress?: string;
  expiresAt?: string;
  agentName?: string;
  executionVenue?: string;
  error?: string;
};

export async function fetchHlAgentAddress(
  wallet: string
): Promise<HlAgentAddressResponse> {
  const base = getBotApiBase();
  const res = await fetch(
    `${base}/api/hl-agent?wallet=${encodeURIComponent(wallet)}`
  );
  return res.json() as Promise<HlAgentAddressResponse>;
}

export async function approveHlBotAgent(
  walletClient: WalletClient,
  agentAddress: `0x${string}`,
  agentName: string
): Promise<void> {
  const client = new ExchangeClient({
    transport,
    wallet: walletClientToHlWallet(walletClient),
  });
  await client.approveAgent({
    agentAddress,
    agentName,
  });
}

export async function saveHlAgentApproval(params: {
  walletAddress: string;
  agentAddress: string;
  agentName: string;
  expiresAt?: string | null;
}): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const agent = params.agentAddress.toLowerCase();

  const { error } = await supabase.rpc('save_hl_agent_approval', {
    p_wallet_address: wallet,
    p_agent_address: agent,
    p_agent_name: params.agentName,
    p_expires_at: params.expiresAt ?? null,
  });
  if (!error) return;

  const missingRpc =
    error.message.includes('Could not find the function') ||
    error.message.includes('schema cache');
  if (!missingRpc) {
    if (/not authenticated/i.test(error.message)) {
      throw new Error('Sign in to Monadier before approving the trading agent.');
    }
    throw new Error(error.message);
  }

  await supabase.rpc('register_my_wallet', { p_wallet: wallet });
  const { error: upsertError } = await supabase.from('hl_agent_approvals').upsert(
    {
      wallet_address: wallet,
      agent_address: agent,
      agent_name: params.agentName,
      approved_at: new Date().toISOString(),
      expires_at: params.expiresAt ?? null,
      revoked_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address' }
  );
  if (upsertError) throw new Error(upsertError.message);
}

export async function approveAndSaveHlBotAgent(opts: {
  walletClient: WalletClient;
  walletAddress: string;
  agentAddress: string;
  agentName?: string;
  expiresAt?: string | null;
}): Promise<void> {
  const wallet = opts.walletAddress;
  const agent = opts.agentAddress as `0x${string}`;
  const agents = await fetchHlExtraAgents(wallet);
  const live = agents.find(
    (a) => a.address.toLowerCase() === agent.toLowerCase() && isHlExtraAgentActive(a)
  );

  const agentName = live?.name ?? pickHlAgentName(agents, agent, opts.agentName ?? HL_AGENT_NAME);

  if (!live) {
    try {
      await approveHlBotAgent(opts.walletClient, agent, agentName);
    } catch (err) {
      const refreshed = await fetchHlExtraAgents(wallet);
      const nowLive = refreshed.find(
        (a) => a.address.toLowerCase() === agent.toLowerCase() && isHlExtraAgentActive(a)
      );
      if (!nowLive) throw new Error(formatHlAgentApproveError(err, refreshed));
    }
  }

  const confirmed =
    (await findActiveHlAgent(wallet, agent)) ??
    (live ? live : null);

  await saveHlAgentApproval({
    walletAddress: wallet,
    agentAddress: agent,
    agentName: confirmed?.name ?? agentName,
    expiresAt: confirmed?.validUntil
      ? new Date(confirmed.validUntil).toISOString()
      : (opts.expiresAt ?? null),
  });
}

export async function loadHlAgentApproval(
  walletAddress: string
): Promise<{ approved: boolean; expiresAt: string | null }> {
  const { data } = await supabase
    .from('hl_agent_approvals')
    .select('expires_at, revoked_at, agent_address')
    .eq('wallet_address', walletAddress.toLowerCase())
    .is('revoked_at', null)
    .maybeSingle();

  if (!data) return { approved: false, expiresAt: null };
  if (data.expires_at && Date.parse(data.expires_at) < Date.now()) {
    return { approved: false, expiresAt: data.expires_at };
  }
  return { approved: true, expiresAt: data.expires_at };
}

/** DB + on-chain HL extraAgents — source of truth for agent approval. */
export async function resolveHlAgentApproval(
  walletAddress: string,
  expectedAgentAddress?: string | null
): Promise<{ approved: boolean; expiresAt: string | null }> {
  const db = await loadHlAgentApproval(walletAddress);
  if (!expectedAgentAddress) return db;

  const live = await findActiveHlAgent(walletAddress, expectedAgentAddress);
  if (!live) return db;

  const expiresAt = new Date(live.validUntil).toISOString();
  if (!db.approved) {
    void saveHlAgentApproval({
      walletAddress,
      agentAddress: expectedAgentAddress,
      agentName: live.name,
      expiresAt,
    }).catch(() => {
      /* best-effort sync */
    });
  }
  return { approved: true, expiresAt };
}

export async function enableHlBotExecution(walletAddress: string): Promise<void> {
  const { error } = await supabase.from('vault_settings').upsert(
    {
      wallet_address: walletAddress.toLowerCase(),
      chain_id: 42161,
      execution_venue: 'hyperliquid',
      auto_trade_enabled: true,
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address,chain_id' }
  );
  if (error) throw new Error(error.message);
}
