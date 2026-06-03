import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { formatUnits } from 'viem';
import { config } from '../config';
import { logger } from '../utils/logger';

export type GmxRequestType = 'increase' | 'decrease';
export type GmxRequestPhase =
  | 'submitted'
  | 'gmx_executed'
  | 'vault_finalized'
  | 'reconciled'
  | 'failed'
  | 'timeout';

export interface GmxRequestRecord {
  id?: string;
  walletAddress: string;
  tokenAddress: string;
  chainId?: number;
  requestType: GmxRequestType;
  phase?: GmxRequestPhase;
  requestKey?: string;
  direction?: 'LONG' | 'SHORT';
  submitTxHash?: string;
  finalizeTxHash?: string;
  positionId?: string;
  gmxSize?: bigint;
  gmxAveragePrice?: bigint;
  gmxCollateral?: bigint;
  vaultCollateral?: bigint;
  usdcDelta?: bigint;
  receivedAmount?: bigint;
  pnlUsdc?: bigint;
  errorMessage?: string;
}

class GmxRequestTracker {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }

  async recordSubmitted(record: GmxRequestRecord): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('gmx_execution_requests')
      .insert({
        wallet_address: record.walletAddress.toLowerCase(),
        token_address: record.tokenAddress.toLowerCase(),
        chain_id: record.chainId ?? 42161,
        request_type: record.requestType,
        phase: 'submitted',
        request_key: record.requestKey,
        direction: record.direction,
        submit_tx_hash: record.submitTxHash,
        position_id: record.positionId,
        gmx_size: record.gmxSize?.toString(),
        gmx_average_price: record.gmxAveragePrice?.toString(),
        gmx_collateral: record.gmxCollateral?.toString(),
        vault_collateral: record.vaultCollateral?.toString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      logger.error('gmx_execution_requests insert failed', { error: error.message });
      return null;
    }
    return data?.id ?? null;
  }

  async updatePhase(
    id: string,
    phase: GmxRequestPhase,
    patch: Partial<GmxRequestRecord> = {}
  ): Promise<void> {
    const { error } = await this.supabase
      .from('gmx_execution_requests')
      .update({
        phase,
        request_key: patch.requestKey,
        finalize_tx_hash: patch.finalizeTxHash,
        gmx_size: patch.gmxSize?.toString(),
        gmx_average_price: patch.gmxAveragePrice?.toString(),
        gmx_collateral: patch.gmxCollateral?.toString(),
        usdc_delta: patch.usdcDelta?.toString(),
        received_amount: patch.receivedAmount?.toString(),
        pnl_usdc: patch.pnlUsdc?.toString(),
        error_message: patch.errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      logger.error('gmx_execution_requests update failed', { id, phase, error: error.message });
    }
  }

  async markGmxExecuted(
    id: string,
    gmx: { size: bigint; averagePrice: bigint; collateral: bigint }
  ): Promise<void> {
    await this.updatePhase(id, 'gmx_executed', {
      gmxSize: gmx.size,
      gmxAveragePrice: gmx.averagePrice,
      gmxCollateral: gmx.collateral,
    });
    logger.info('GMX request executed by keeper', {
      trackerId: id.slice(0, 8),
      gmxSize: gmx.size.toString(),
      avgPrice: formatUnits(gmx.averagePrice, 30),
      collateral: formatUnits(gmx.collateral, 6),
    });
  }

  async markVaultFinalized(
    id: string,
    patch: Pick<GmxRequestRecord, 'finalizeTxHash' | 'usdcDelta' | 'receivedAmount' | 'pnlUsdc'>
  ): Promise<void> {
    await this.updatePhase(id, 'vault_finalized', patch);
  }

  async markFailed(id: string | null, message: string): Promise<void> {
    if (!id) return;
    await this.updatePhase(id, 'failed', { errorMessage: message.slice(0, 500) });
  }

  async markTimeout(id: string | null, message: string): Promise<void> {
    if (!id) return;
    await this.updatePhase(id, 'timeout', { errorMessage: message.slice(0, 500) });
  }

  async listStuckSubmitted(olderThanMinutes = 15): Promise<{ id: string; wallet: string; token: string }[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
    const { data } = await this.supabase
      .from('gmx_execution_requests')
      .select('id, wallet_address, token_address')
      .eq('phase', 'submitted')
      .lt('created_at', cutoff)
      .limit(50);

    return (data ?? []).map((r) => ({
      id: r.id,
      wallet: r.wallet_address,
      token: r.token_address,
    }));
  }
}

export const gmxRequestTracker = new GmxRequestTracker();
