import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import type { WalletClient } from 'viem';
import { walletClientToHlWallet } from './walletAdapter';
import { fetchBotApi, getBotApiBase } from '../botApiFetch';
import { supabase } from '../supabase';
import { getAuthUserId, registerMyWalletQuiet } from '../userWallets';
import {
  fetchHlExtraAgents,
  isHlExtraAgentActive,
  type HlExtraAgent,
} from './user';

const transport = new HttpTransport();
const AGENT_NAME_MAX = 16;
const approvalSaveAttempted = new Set<string>();

function approvalSaveKey(wallet: string, agent: string): string {
  return `${wallet.toLowerCase()}:${agent.toLowerCase()}`;
}

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

/** Any active HyperGain-named HL extra agent — survives bot-API outages on stop/start. */
export async function findActiveMonadierHlAgent(wallet: string): Promise<HlExtraAgent | null> {
  const agents = await fetchHlExtraAgents(wallet);
  return (
    agents.find(
      (a) => isHlExtraAgentActive(a) && a.name.toLowerCase().startsWith(HL_AGENT_NAME)
    ) ?? null
  );
}

function syncAgentApprovalFromChain(wallet: string, live: HlExtraAgent): void {
  const agentAddress = live.address.toLowerCase();
  const saveKey = approvalSaveKey(wallet, agentAddress);
  if (approvalSaveAttempted.has(saveKey)) return;
  void saveHlAgentApproval({
    walletAddress: wallet,
    agentAddress,
    agentName: live.name,
    expiresAt: new Date(live.validUntil).toISOString(),
  }).catch(() => undefined);
}

function agentApprovedFromChain(
  wallet: string,
  live: HlExtraAgent
): { approved: boolean; expiresAt: string | null; loaded: boolean } {
  syncAgentApprovalFromChain(wallet, live);
  return {
    approved: true,
    expiresAt: new Date(live.validUntil).toISOString(),
    loaded: true,
  };
}

function formatHlAgentApproveError(err: unknown, agents: HlExtraAgent[]): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (!/extra agent already used|agent already/i.test(msg)) return msg;
  if (agents.length >= 4) {
    return 'Hyperliquid allows up to 4 API wallets. Revoke an unused key at app.hyperliquid.xyz → More → API, then try again in HyperGain.';
  }
  return 'This API wallet slot is already in use on Hyperliquid. Open app.hyperliquid.xyz → More → API, revoke an old HyperGain or unused key, then approve again.';
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
  const res = await fetchBotApi(
    `/api/hl-agent?wallet=${encodeURIComponent(wallet)}`,
    { retries: 2 }
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

async function saveHlAgentApprovalViaBotApi(params: {
  walletAddress: string;
  agentAddress: string;
  agentName: string;
  expiresAt?: string | null;
}): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const meta = await fetchHlAgentAddress(wallet);
  const agentAddress =
    meta.success && meta.agentAddress
      ? meta.agentAddress.toLowerCase()
      : params.agentAddress.toLowerCase();

  const res = await fetchBotApi('/api/hl-agent/approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet,
      agentAddress,
      agentName: params.agentName,
      expiresAt: params.expiresAt ?? null,
    }),
    retries: 2,
  });
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Could not save agent approval');
  }
}

export async function saveHlAgentApproval(params: {
  walletAddress: string;
  agentAddress: string;
  agentName: string;
  expiresAt?: string | null;
  userId?: string;
}): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const agent = params.agentAddress.toLowerCase();

  try {
    await saveHlAgentApprovalViaBotApi(params);
    approvalSaveAttempted.add(approvalSaveKey(wallet, agent));
    return;
  } catch {
    /* fall back to Supabase when bot-service is unreachable */
  }

  const userId = params.userId ?? (await getAuthUserId());
  if (!userId) {
    return;
  }

  const saveKey = approvalSaveKey(wallet, agent);
  if (approvalSaveAttempted.has(saveKey)) return;

  await registerMyWalletQuiet(wallet, userId);

  const { error } = await supabase.rpc('save_hl_agent_approval', {
    p_wallet_address: wallet,
    p_agent_address: agent,
    p_agent_name: params.agentName,
    p_expires_at: params.expiresAt ?? null,
  });
  if (!error) {
    approvalSaveAttempted.add(saveKey);
    return;
  }

  if (/not authenticated/i.test(error.message)) {
    throw new Error('Sign in to HyperGain before approving the trading agent.');
  }
  if (/linked to another/i.test(error.message)) {
    throw new Error('This wallet is linked to another HyperGain account.');
  }
  if (/agent not approved|not found on chain/i.test(error.message)) {
    approvalSaveAttempted.add(saveKey);
    return;
  }
  throw new Error(error.message);
}

export async function approveAndSaveHlBotAgent(opts: {
  walletClient: WalletClient;
  walletAddress: string;
  agentAddress: string;
  agentName?: string;
  expiresAt?: string | null;
  userId?: string;
  /** Re-call approveAgent even if still active — refreshes HL ~90d validUntil. */
  forceRenew?: boolean;
}): Promise<void> {
  const wallet = opts.walletAddress;
  const agent = opts.agentAddress as `0x${string}`;
  const agents = await fetchHlExtraAgents(wallet);
  const live = agents.find(
    (a) => a.address.toLowerCase() === agent.toLowerCase() && isHlExtraAgentActive(a)
  );

  const agentName = live?.name ?? pickHlAgentName(agents, agent, opts.agentName ?? HL_AGENT_NAME);

  if (!live || opts.forceRenew) {
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
    userId: opts.userId,
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
  const wallet = walletAddress.toLowerCase();
  const db = await loadHlAgentApproval(wallet);

  if (expectedAgentAddress) {
    const live = await findActiveHlAgent(wallet, expectedAgentAddress);
    if (live) {
      const expiresAt = new Date(live.validUntil).toISOString();
      if (!db.approved) {
        const saveKey = approvalSaveKey(wallet, expectedAgentAddress.toLowerCase());
        if (!approvalSaveAttempted.has(saveKey)) {
          void saveHlAgentApproval({
            walletAddress: wallet,
            agentAddress: expectedAgentAddress.toLowerCase(),
            agentName: live.name,
            expiresAt,
          }).catch(() => {
            /* best-effort sync */
          });
        }
      }
      return { approved: true, expiresAt };
    }

    // On-chain is source of truth — DB cache alone cannot sign HL orders.
    const expiredOnChain = (await fetchHlExtraAgents(wallet)).find(
      (a) => a.address.toLowerCase() === expectedAgentAddress.toLowerCase()
    );
    if (expiredOnChain) {
      return {
        approved: false,
        expiresAt: new Date(expiredOnChain.validUntil).toISOString(),
      };
    }
    return { approved: false, expiresAt: db.expiresAt };
  }

  return db;
}

/** On-chain agent check — bot API optional; HyperGain extraAgents on HL are source of truth. */
export async function checkHlBotAgentApproved(
  walletAddress: string
): Promise<{ approved: boolean; expiresAt: string | null; loaded: boolean }> {
  const wallet = walletAddress.toLowerCase();
  try {
    let agentAddress: string | null = null;
    try {
      const meta = await fetchHlAgentAddress(wallet);
      if (meta.success && meta.agentAddress) {
        agentAddress = meta.agentAddress.toLowerCase();
      }
    } catch {
      /* bot API optional — on-chain HL read is source of truth */
    }

    if (agentAddress) {
      const live = await findActiveHlAgent(wallet, agentAddress);
      if (live) return agentApprovedFromChain(wallet, live);
      const monadierLive = await findActiveMonadierHlAgent(wallet);
      if (monadierLive) return agentApprovedFromChain(wallet, monadierLive);
      const result = await resolveHlAgentApproval(wallet, agentAddress);
      return { approved: result.approved, expiresAt: result.expiresAt, loaded: true };
    }

    const monadierLive = await findActiveMonadierHlAgent(wallet);
    if (monadierLive) return agentApprovedFromChain(wallet, monadierLive);

    return { approved: false, expiresAt: null, loaded: true };
  } catch {
    return { approved: false, expiresAt: null, loaded: false };
  }
}

const HL_BOT_SETTINGS_CHAIN_ID = 42161;

/** Clear legacy Base/other-chain auto_trade flags so only Arbitrum (42161) is authoritative. */
async function clearSiblingChainAutoTrade(wallet: string): Promise<void> {
  await supabase
    .from('vault_settings')
    .update({
      auto_trade_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq('wallet_address', wallet)
    .eq('auto_trade_enabled', true)
    .neq('chain_id', HL_BOT_SETTINGS_CHAIN_ID);
}

export async function enableHlBotExecution(walletAddress: string): Promise<void> {
  const wallet = walletAddress.toLowerCase();
  const { error } = await supabase.from('vault_settings').upsert(
    {
      wallet_address: wallet,
      chain_id: HL_BOT_SETTINGS_CHAIN_ID,
      execution_venue: 'hyperliquid',
      auto_trade_enabled: true,
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address,chain_id' }
  );
  if (error) throw new Error(error.message);
  await clearSiblingChainAutoTrade(wallet);

  if (getBotApiBase()) {
    void fetchBotApi('/api/referral/try-qualify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, botStarted: true }),
      retries: 1,
    }).catch(() => undefined);
  }
}

/** Tell Railway to skip this wallet — HL stop is DB-only (no MetaMask tx). */
export async function disableHlBotExecution(walletAddress: string): Promise<void> {
  const wallet = walletAddress.toLowerCase();
  const { error } = await supabase.from('vault_settings').upsert(
    {
      wallet_address: wallet,
      chain_id: HL_BOT_SETTINGS_CHAIN_ID,
      execution_venue: 'hyperliquid',
      auto_trade_enabled: false,
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address,chain_id' }
  );
  if (error) throw new Error(error.message);
  await clearSiblingChainAutoTrade(wallet);
}
