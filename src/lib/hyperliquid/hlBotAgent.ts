import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import type { WalletClient } from 'viem';
import { walletClientToHlWallet } from './walletAdapter';
import { getBotApiBase } from '../signalService';
import { supabase } from '../supabase';

const transport = new HttpTransport();

export const MIN_HL_BOT_USD = 20;
export const HL_AGENT_NAME = 'monadier';

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
