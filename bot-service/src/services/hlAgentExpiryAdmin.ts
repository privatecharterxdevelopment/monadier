/**
 * List HL agent approvals that are expired or inside the renew window.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const RENEW_WITHIN_DAYS = 14;

export type AgentExpiryRow = {
  wallet: string;
  agentAddress: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  status: 'expired' | 'expiring_soon' | 'ok';
};

export async function listAgentExpiryStatuses(): Promise<AgentExpiryRow[]> {
  try {
    const { data, error } = await supabase
      .from('hl_agent_approvals')
      .select('wallet_address, agent_address, expires_at, revoked_at')
      .is('revoked_at', null);
    if (error) {
      logger.warn('HL agent expiry list failed', { error: error.message });
      return [];
    }
    const now = Date.now();
    const renewMs = RENEW_WITHIN_DAYS * 24 * 60 * 60 * 1000;
    const rows: AgentExpiryRow[] = [];
    for (const r of data ?? []) {
      const wallet = String(r.wallet_address ?? '').toLowerCase();
      if (!wallet) continue;
      const expiresAt = r.expires_at ? String(r.expires_at) : null;
      const t = expiresAt ? Date.parse(expiresAt) : NaN;
      if (!Number.isFinite(t)) continue;
      const msLeft = t - now;
      const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
      let status: AgentExpiryRow['status'] = 'ok';
      if (msLeft <= 0) status = 'expired';
      else if (msLeft <= renewMs) status = 'expiring_soon';
      else continue;
      rows.push({
        wallet,
        agentAddress: r.agent_address ? String(r.agent_address).toLowerCase() : null,
        expiresAt,
        daysLeft,
        status,
      });
    }
    rows.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
    return rows;
  } catch (err) {
    logger.warn('HL agent expiry list error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
