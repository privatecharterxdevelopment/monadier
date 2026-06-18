import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { fetchHlExtraAgents, isHlExtraAgentActive } from './hlInfo';

export type HlAgentApproval = {
  wallet_address: string;
  agent_address: string;
  approved_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

class HlAgentApprovalService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }

  async getApproval(walletAddress: string): Promise<HlAgentApproval | null> {
    const { data, error } = await this.supabase
      .from('hl_agent_approvals')
      .select('wallet_address, agent_address, approved_at, expires_at, revoked_at')
      .eq('wallet_address', walletAddress.toLowerCase())
      .is('revoked_at', null)
      .maybeSingle();

    if (error) {
      logger.error('hl_agent_approvals read failed', { error: error.message });
      return null;
    }
    return data as HlAgentApproval | null;
  }

  async isApproved(walletAddress: string, expectedAgent: string): Promise<boolean> {
    const agents = await fetchHlExtraAgents(walletAddress);
    const onChain = agents.find(
      (a) =>
        a.address === expectedAgent.toLowerCase() && isHlExtraAgentActive(a)
    );
    if (onChain) return true;

    const row = await this.getApproval(walletAddress);
    if (!row) return false;
    if (row.agent_address.toLowerCase() !== expectedAgent.toLowerCase()) return false;
    if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return false;
    return true;
  }

  async saveApproval(params: {
    walletAddress: string;
    agentAddress: string;
    agentName?: string;
    expiresAt?: string | null;
  }): Promise<void> {
    const wallet = params.walletAddress.toLowerCase();
    const agent = params.agentAddress.toLowerCase();
    const now = new Date().toISOString();

    const { error } = await this.supabase.from('hl_agent_approvals').upsert(
      {
        wallet_address: wallet,
        agent_address: agent,
        agent_name: params.agentName ?? 'monadier',
        approved_at: now,
        expires_at: params.expiresAt ?? null,
        revoked_at: null,
        updated_at: now,
      },
      { onConflict: 'wallet_address' }
    );

    if (error) {
      logger.error('hl_agent_approvals upsert failed', { error: error.message, wallet });
      throw new Error(error.message);
    }
  }

  async listApprovedWallets(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('hl_agent_approvals')
      .select('wallet_address, expires_at, revoked_at')
      .is('revoked_at', null);

    if (error || !data) return [];

    return data
      .filter((r) => !r.expires_at || Date.parse(r.expires_at) > Date.now())
      .map((r) => r.wallet_address as string);
  }
}

export const hlAgentApprovalService = new HlAgentApprovalService();
