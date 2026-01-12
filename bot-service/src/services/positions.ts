import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface Position {
  id: string;
  wallet_address: string;
  chain_id: number;
  token_address: string;
  token_symbol: string;
  direction: 'LONG' | 'SHORT'; // Trade direction
  entry_price: number;
  entry_amount: number;
  token_amount: number;
  entry_tx_hash: string | null;
  highest_price: number;
  lowest_price: number; // For SHORT positions
  trailing_stop_price: number | null;
  trailing_stop_percent: number;
  take_profit_price: number | null; // Fixed TP level
  take_profit_percent: number; // TP percentage from entry
  profit_lock_percent: number; // Min profit % before stop activates (0.2% for aggressive)
  stop_activated: boolean; // Only true once in profit
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

// Default profit % before trailing stop activates (can be overridden per position)
const DEFAULT_PROFIT_THRESHOLD = 0.5; // 0.5% default

export class PositionService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      config.supabaseUrl,
      config.supabaseServiceKey
    );
  }

  /**
   * Open a new position (LONG or SHORT)
   * Trailing stop is NOT active until position is in profit
   * Take Profit is set immediately
   */
  async openPosition(params: {
    walletAddress: string;
    chainId: number;
    tokenAddress: string;
    tokenSymbol: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    entryAmount: number; // USDC spent
    tokenAmount: number; // Token received
    txHash: string;
    trailingStopPercent?: number;
    takeProfitPercent?: number;
    profitLockPercent?: number; // Min profit % before stop activates (0.2% for aggressive)
    entryReason?: string; // Why the bot opened this trade
  }): Promise<Position | null> {
    // DUPLICATE CHECK: Prevent double-insert with same txHash
    const { data: existing } = await this.supabase
      .from('positions')
      .select('id')
      .eq('entry_tx_hash', params.txHash)
      .limit(1);

    if (existing && existing.length > 0) {
      logger.warn('Position already exists for this txHash - skipping duplicate', {
        txHash: params.txHash,
        existingId: existing[0].id
      });
      return null;
    }

    const trailingStopPercent = params.trailingStopPercent || 1.0; // Default 1%
    const takeProfitPercent = params.takeProfitPercent || 5.0; // Default 5% TP
    const profitLockPercent = params.profitLockPercent || DEFAULT_PROFIT_THRESHOLD; // Default 0.5%

    // Calculate take profit price based on direction
    const takeProfitPrice = params.direction === 'LONG'
      ? params.entryPrice * (1 + takeProfitPercent / 100)
      : params.entryPrice * (1 - takeProfitPercent / 100);

    try {
      const { data, error } = await this.supabase
        .from('positions')
        .insert({
          wallet_address: params.walletAddress.toLowerCase(),
          chain_id: params.chainId,
          token_address: params.tokenAddress,
          token_symbol: params.tokenSymbol,
          direction: params.direction,
          entry_price: params.entryPrice,
          entry_amount: params.entryAmount,
          token_amount: params.tokenAmount,
          entry_tx_hash: params.txHash,
          highest_price: params.entryPrice,
          lowest_price: params.entryPrice,
          trailing_stop_price: null, // NO STOP until in profit
          trailing_stop_percent: trailingStopPercent,
          take_profit_price: takeProfitPrice,
          take_profit_percent: takeProfitPercent,
          profit_lock_percent: profitLockPercent, // User configurable!
          stop_activated: false, // Not active yet
          status: 'open'
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to open position', { error });
        return null;
      }

      logger.info(`📈 ${params.direction} position opened (PROFIT-ONLY mode)`, {
        id: data.id,
        wallet: params.walletAddress,
        token: params.tokenSymbol,
        direction: params.direction,
        entryPrice: params.entryPrice,
        takeProfitPrice: takeProfitPrice.toFixed(4),
        stopActivatesAt: `+${profitLockPercent}% profit`
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
   * Get the most recently closed position for a wallet (for cooldown tracking)
   */
  async getLastClosedPosition(walletAddress: string, chainId: number): Promise<Position | null> {
    try {
      const { data, error } = await this.supabase
        .from('positions')
        .select('*')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('chain_id', chainId)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        // No closed positions is not an error
        return null;
      }

      return data;
    } catch (err) {
      return null;
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
        .in('status', ['open', 'closing']); // Include positions marked for emergency close

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
   * Update trailing stop - PROFIT-ONLY logic (works for LONG and SHORT)
   * Stop only activates once position is in profit by threshold
   * Once activated, stop is always at least at entry price (break-even)
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

      const entryPrice = position.entry_price;
      const direction = position.direction || 'LONG';
      // Use position-specific profit lock (0.2% for aggressive, 0.5% default)
      const profitLockThreshold = position.profit_lock_percent || DEFAULT_PROFIT_THRESHOLD;

      // Calculate profit based on direction
      const profitPercent = direction === 'LONG'
        ? ((currentPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - currentPrice) / entryPrice) * 100;

      const isInProfit = profitPercent >= profitLockThreshold;

      // If not yet in profit threshold, don't update anything - just hold
      if (!isInProfit && !position.stop_activated) {
        logger.debug('Position not yet in profit, holding...', {
          positionId,
          direction,
          entryPrice,
          currentPrice,
          profitPercent: profitPercent.toFixed(2) + '%',
          needsProfit: profitLockThreshold + '%'
        });
        return position;
      }

      // Calculate trailing stop based on direction
      let newTrailingStop: number;
      let shouldUpdate: boolean;

      if (direction === 'LONG') {
        // LONG: Stop below current price, minimum at entry
        const trailingStop = currentPrice * (1 - position.trailing_stop_percent / 100);
        newTrailingStop = Math.max(entryPrice, trailingStop);
        shouldUpdate = currentPrice > position.highest_price || !position.stop_activated;
      } else {
        // SHORT: Stop above current price, maximum at entry
        const trailingStop = currentPrice * (1 + position.trailing_stop_percent / 100);
        newTrailingStop = Math.min(entryPrice, trailingStop);
        shouldUpdate = currentPrice < position.lowest_price || !position.stop_activated;
      }

      if (!shouldUpdate) {
        return position;
      }

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // First time activation
      if (!position.stop_activated && isInProfit) {
        updateData.stop_activated = true;
        updateData.trailing_stop_price = newTrailingStop;

        if (direction === 'LONG') {
          updateData.highest_price = currentPrice;
        } else {
          updateData.lowest_price = currentPrice;
        }

        const guaranteedProfit = direction === 'LONG'
          ? ((newTrailingStop - entryPrice) / entryPrice * 100)
          : ((entryPrice - newTrailingStop) / entryPrice * 100);

        logger.info(`🎯 ${direction} TRAILING STOP ACTIVATED (in profit!)`, {
          positionId,
          token: position.token_symbol,
          direction,
          entryPrice,
          currentPrice,
          profitPercent: profitPercent.toFixed(2) + '%',
          trailingStop: newTrailingStop,
          guaranteedProfit: guaranteedProfit.toFixed(2) + '%'
        });
      }
      // Already activated, update to new extreme
      else if (position.stop_activated) {
        if (direction === 'LONG' && currentPrice > position.highest_price) {
          updateData.highest_price = currentPrice;
          updateData.trailing_stop_price = newTrailingStop;
          const profitLocked = ((newTrailingStop - entryPrice) / entryPrice * 100);

          logger.info('📈 LONG trailing stop moved up', {
            positionId,
            token: position.token_symbol,
            oldHigh: position.highest_price,
            newHigh: currentPrice,
            newStop: newTrailingStop,
            profitLocked: profitLocked.toFixed(2) + '%'
          });
        } else if (direction === 'SHORT' && currentPrice < position.lowest_price) {
          updateData.lowest_price = currentPrice;
          updateData.trailing_stop_price = newTrailingStop;
          const profitLocked = ((entryPrice - newTrailingStop) / entryPrice * 100);

          logger.info('📉 SHORT trailing stop moved down', {
            positionId,
            token: position.token_symbol,
            oldLow: position.lowest_price,
            newLow: currentPrice,
            newStop: newTrailingStop,
            profitLocked: profitLocked.toFixed(2) + '%'
          });
        }
      }

      const { data, error } = await this.supabase
        .from('positions')
        .update(updateData)
        .eq('id', positionId)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update trailing stop', { error });
        return null;
      }

      return data;
    } catch (err) {
      logger.error('Error updating trailing stop', { error: err });
      return null;
    }
  }

  /**
   * Check if position should be closed (LONG or SHORT)
   * Closes if:
   * 1. Take Profit hit (immediate close at profit!)
   * 2. Trailing stop triggered (only after activated = in profit)
   */
  shouldClose(position: Position, currentPrice: number): { close: boolean; reason: 'take_profit' | 'trailing_stop' | null } {
    const direction = position.direction || 'LONG';

    // Check Take Profit FIRST (immediate exit at profit target)
    if (position.take_profit_price) {
      if (direction === 'LONG' && currentPrice >= position.take_profit_price) {
        logger.info('🎯 TAKE PROFIT HIT!', {
          positionId: position.id,
          direction,
          entryPrice: position.entry_price,
          currentPrice,
          takeProfitPrice: position.take_profit_price,
          profit: ((currentPrice - position.entry_price) / position.entry_price * 100).toFixed(2) + '%'
        });
        return { close: true, reason: 'take_profit' };
      }
      if (direction === 'SHORT' && currentPrice <= position.take_profit_price) {
        logger.info('🎯 TAKE PROFIT HIT!', {
          positionId: position.id,
          direction,
          entryPrice: position.entry_price,
          currentPrice,
          takeProfitPrice: position.take_profit_price,
          profit: ((position.entry_price - currentPrice) / position.entry_price * 100).toFixed(2) + '%'
        });
        return { close: true, reason: 'take_profit' };
      }
    }

    // Stop not activated = NEVER close (hold through dips/spikes)
    if (!position.stop_activated || !position.trailing_stop_price) {
      return { close: false, reason: null };
    }

    // Check trailing stop based on direction
    if (direction === 'LONG') {
      if (currentPrice <= position.trailing_stop_price) {
        // Double-check we're closing at profit or break-even
        const wouldBeProfit = position.trailing_stop_price >= position.entry_price;
        if (!wouldBeProfit) {
          logger.warn('LONG stop triggered but would be a loss - NOT closing', {
            positionId: position.id,
            entryPrice: position.entry_price,
            stopPrice: position.trailing_stop_price,
            currentPrice
          });
          return { close: false, reason: null };
        }
        return { close: true, reason: 'trailing_stop' };
      }
    } else {
      // SHORT: Close if price rises above stop
      if (currentPrice >= position.trailing_stop_price) {
        // Double-check we're closing at profit or break-even
        const wouldBeProfit = position.trailing_stop_price <= position.entry_price;
        if (!wouldBeProfit) {
          logger.warn('SHORT stop triggered but would be a loss - NOT closing', {
            positionId: position.id,
            entryPrice: position.entry_price,
            stopPrice: position.trailing_stop_price,
            currentPrice
          });
          return { close: false, reason: null };
        }
        return { close: true, reason: 'trailing_stop' };
      }
    }

    return { close: false, reason: null };
  }

  /**
   * Check if position is currently in profit (direction-aware)
   */
  isInProfit(position: Position, currentPrice: number): boolean {
    const direction = position.direction || 'LONG';
    if (direction === 'LONG') {
      return currentPrice > position.entry_price;
    } else {
      return currentPrice < position.entry_price;
    }
  }

  /**
   * Get current profit percentage (direction-aware)
   */
  getProfitPercent(position: Position, currentPrice: number): number {
    const direction = position.direction || 'LONG';
    if (direction === 'LONG') {
      return ((currentPrice - position.entry_price) / position.entry_price) * 100;
    } else {
      return ((position.entry_price - currentPrice) / position.entry_price) * 100;
    }
  }

  /**
   * Close a position
   */
  async closePosition(params: {
    positionId: string;
    exitPrice: number;
    exitAmount: number; // USDC received
    txHash: string;
    closeReason: 'trailing_stop' | 'take_profit' | 'manual' | 'stop_loss' | 'emergency_close' | 'signal_reversal';
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

      // Calculate P/L based on price difference (accounts for direction)
      // This is more accurate than amount-based calculation since token amounts are estimated
      const direction = position.direction || 'LONG';
      const priceChange = direction === 'LONG'
        ? params.exitPrice - position.entry_price
        : position.entry_price - params.exitPrice;

      const profitLossPercent = (priceChange / position.entry_price) * 100;
      const profitLoss = (position.entry_amount * profitLossPercent) / 100;

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

      const emoji = profitLoss >= 0 ? '✅' : '❌';
      logger.info(`${emoji} Position closed`, {
        positionId: params.positionId,
        token: position.token_symbol,
        entryPrice: position.entry_price,
        exitPrice: params.exitPrice,
        profitLoss: `$${profitLoss.toFixed(2)}`,
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

  /**
   * Check if wallet has ANY non-closed position for a token
   * This prevents opening new positions when there are pending/failed ones
   */
  async hasAnyActivePosition(walletAddress: string, chainId: number, tokenAddress: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('positions')
      .select('id, status')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('chain_id', chainId)
      .eq('token_address', tokenAddress.toLowerCase())
      .in('status', ['open', 'closing', 'failed'])
      .limit(1);

    return (data && data.length > 0) || false;
  }

  /**
   * Mark ALL positions for a user/token as synced (closed with 0 balance)
   * Called when on-chain balance is 0 but database has open positions
   */
  async syncPositionsWithChain(walletAddress: string, chainId: number, tokenAddress: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('positions')
      .update({
        status: 'failed',
        close_reason: 'Sync: On-chain balance is 0',
        updated_at: new Date().toISOString()
      })
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('chain_id', chainId)
      .eq('token_address', tokenAddress.toLowerCase())
      .in('status', ['open', 'closing'])
      .select('id');

    if (error) {
      logger.error('Failed to sync positions with chain', { error });
      return 0;
    }

    const count = data?.length || 0;
    if (count > 0) {
      logger.warn(`Synced ${count} orphaned positions to failed status`, {
        walletAddress,
        tokenAddress,
        count
      });
    }
    return count;
  }

  /**
   * Get count of all non-closed positions for a user
   */
  async getActivePositionCount(walletAddress: string, chainId: number): Promise<number> {
    const { data } = await this.supabase
      .from('positions')
      .select('id')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('chain_id', chainId)
      .in('status', ['open', 'closing']);

    return data?.length || 0;
  }

  /**
   * Save bot analysis for UI display
   */
  async saveAnalysis(params: {
    chainId: number;
    tokenAddress: string;
    tokenSymbol: string;
    signal: 'LONG' | 'SHORT' | 'HOLD';
    confidence: number;
    currentPrice: number;
    factors: {
      rsi: number;
      macdSignal: string;
      volumeSpike: boolean;
      trend: string;
      pattern: string | null;
      priceChange24h: number;
    };
    recommendation: string;
  }): Promise<void> {
    try {
      // Upsert - update if exists, insert if not
      await this.supabase
        .from('bot_analysis')
        .upsert({
          chain_id: params.chainId,
          token_address: params.tokenAddress,
          token_symbol: params.tokenSymbol,
          signal: params.signal,
          confidence: params.confidence,
          current_price: params.currentPrice,
          rsi: params.factors.rsi,
          macd_signal: params.factors.macdSignal,
          volume_spike: params.factors.volumeSpike,
          trend: params.factors.trend,
          pattern: params.factors.pattern,
          price_change_24h: params.factors.priceChange24h,
          recommendation: params.recommendation,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'chain_id,token_address'
        });
    } catch (err) {
      logger.error('Failed to save analysis', { error: err });
    }
  }

  /**
   * Get latest bot analysis for display
   */
  async getLatestAnalysis(chainId: number): Promise<any[]> {
    const { data } = await this.supabase
      .from('bot_analysis')
      .select('*')
      .eq('chain_id', chainId)
      .order('updated_at', { ascending: false })
      .limit(10);

    return data || [];
  }
}

export const positionService = new PositionService();
