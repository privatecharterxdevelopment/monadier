import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface Position {
  id: string;
  wallet_address: string;
  chain_id: number;
  token_address: string;
  token_symbol: string;
  entry_price: number;
  entry_amount: number;
  token_amount: number;
  entry_tx_hash: string | null;
  highest_price: number;
  trailing_stop_price: number | null;
  trailing_stop_percent: number;
  exit_price: number | null;
  exit_amount: number | null;
  exit_tx_hash: string | null;
  profit_loss: number | null;
  profit_loss_percent: number | null;
  status: 'open' | 'closing' | 'closed' | 'failed';
  close_reason: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export class PositionService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      config.supabaseUrl,
      config.supabaseServiceKey
    );
  }

  /**
   * Open a new position
   */
  async openPosition(params: {
    walletAddress: string;
    chainId: number;
    tokenAddress: string;
    tokenSymbol: string;
    entryPrice: number;
    entryAmount: number; // USDC spent
    tokenAmount: number; // Token received
    txHash: string;
    trailingStopPercent?: number;
  }): Promise<Position | null> {
    const trailingStopPercent = params.trailingStopPercent || 1.0; // Default 1%
    const trailingStopPrice = params.entryPrice * (1 - trailingStopPercent / 100);

    try {
      const { data, error } = await this.supabase
        .from('positions')
        .insert({
          wallet_address: params.walletAddress.toLowerCase(),
          chain_id: params.chainId,
          token_address: params.tokenAddress,
          token_symbol: params.tokenSymbol,
          entry_price: params.entryPrice,
          entry_amount: params.entryAmount,
          token_amount: params.tokenAmount,
          entry_tx_hash: params.txHash,
          highest_price: params.entryPrice,
          trailing_stop_price: trailingStopPrice,
          trailing_stop_percent: trailingStopPercent,
          status: 'open'
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to open position', { error });
        return null;
      }

      logger.info('Position opened', {
        id: data.id,
        wallet: params.walletAddress,
        token: params.tokenSymbol,
        entryPrice: params.entryPrice,
        trailingStop: trailingStopPrice
      });

      return data;
    } catch (err) {
      logger.error('Error opening position', { error: err });
      return null;
    }
  }

  /**
   * Get all open positions for a wallet
   */
  async getOpenPositions(walletAddress: string, chainId?: number): Promise<Position[]> {
    try {
      let query = this.supabase
        .from('positions')
        .select('*')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('status', 'open');

      if (chainId) {
        query = query.eq('chain_id', chainId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to get open positions', { error });
        return [];
      }

      return data || [];
    } catch (err) {
      logger.error('Error getting open positions', { error: err });
      return [];
    }
  }

  /**
   * Get all open positions across all wallets
   */
  async getAllOpenPositions(chainId?: number): Promise<Position[]> {
    try {
      let query = this.supabase
        .from('positions')
        .select('*')
        .eq('status', 'open');

      if (chainId) {
        query = query.eq('chain_id', chainId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to get all open positions', { error });
        return [];
      }

      return data || [];
    } catch (err) {
      logger.error('Error getting all open positions', { error: err });
      return [];
    }
  }

  /**
   * Update trailing stop when price goes higher
   */
  async updateTrailingStop(positionId: string, currentPrice: number): Promise<Position | null> {
    try {
      // First get the position
      const { data: position, error: fetchError } = await this.supabase
        .from('positions')
        .select('*')
        .eq('id', positionId)
        .eq('status', 'open')
        .single();

      if (fetchError || !position) {
        return null;
      }

      // Only update if current price is higher than highest
      if (currentPrice <= position.highest_price) {
        return position;
      }

      // Calculate new trailing stop
      const newTrailingStop = currentPrice * (1 - position.trailing_stop_percent / 100);

      const { data, error } = await this.supabase
        .from('positions')
        .update({
          highest_price: currentPrice,
          trailing_stop_price: newTrailingStop,
          updated_at: new Date().toISOString()
        })
        .eq('id', positionId)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update trailing stop', { error });
        return null;
      }

      logger.info('Trailing stop updated', {
        positionId,
        newHighest: currentPrice,
        newStop: newTrailingStop,
        profitLocked: ((newTrailingStop - position.entry_price) / position.entry_price * 100).toFixed(2) + '%'
      });

      return data;
    } catch (err) {
      logger.error('Error updating trailing stop', { error: err });
      return null;
    }
  }

  /**
   * Check if position should be closed (price hit trailing stop)
   */
  shouldClose(position: Position, currentPrice: number): boolean {
    if (!position.trailing_stop_price) return false;
    return currentPrice <= position.trailing_stop_price;
  }

  /**
   * Close a position
   */
  async closePosition(params: {
    positionId: string;
    exitPrice: number;
    exitAmount: number; // USDC received
    txHash: string;
    closeReason: 'trailing_stop' | 'take_profit' | 'manual' | 'stop_loss';
  }): Promise<Position | null> {
    try {
      // Get position to calculate P/L
      const { data: position } = await this.supabase
        .from('positions')
        .select('*')
        .eq('id', params.positionId)
        .single();

      if (!position) {
        logger.error('Position not found for closing', { positionId: params.positionId });
        return null;
      }

      const profitLoss = params.exitAmount - position.entry_amount;
      const profitLossPercent = (profitLoss / position.entry_amount) * 100;

      const { data, error } = await this.supabase
        .from('positions')
        .update({
          exit_price: params.exitPrice,
          exit_amount: params.exitAmount,
          exit_tx_hash: params.txHash,
          profit_loss: profitLoss,
          profit_loss_percent: profitLossPercent,
          status: 'closed',
          close_reason: params.closeReason,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', params.positionId)
        .select()
        .single();

      if (error) {
        logger.error('Failed to close position', { error });
        return null;
      }

      logger.info('Position closed', {
        positionId: params.positionId,
        entryPrice: position.entry_price,
        exitPrice: params.exitPrice,
        profitLoss: profitLoss.toFixed(2),
        profitLossPercent: profitLossPercent.toFixed(2) + '%',
        closeReason: params.closeReason
      });

      return data;
    } catch (err) {
      logger.error('Error closing position', { error: err });
      return null;
    }
  }

  /**
   * Mark position as failed
   */
  async markFailed(positionId: string, reason: string): Promise<void> {
    await this.supabase
      .from('positions')
      .update({
        status: 'failed',
        close_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', positionId);
  }

  /**
   * Check if wallet has an open position for a token
   */
  async hasOpenPosition(walletAddress: string, chainId: number, tokenAddress: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('positions')
      .select('id')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('chain_id', chainId)
      .eq('token_address', tokenAddress)
      .eq('status', 'open')
      .limit(1);

    return (data && data.length > 0) || false;
  }
}

export const positionService = new PositionService();
