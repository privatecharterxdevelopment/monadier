import { vaultV6Client, ARBITRUM_V6_CONFIG, TOKEN_ADDRESSES } from './vaultV6Client';
import { subscriptionService } from './subscription';
import { logger } from '../utils/logger';
import { formatUnits } from 'viem';

/**
 * V6 Position Monitor
 *
 * Monitors all active positions on V6 vault for:
 * - Stop-Loss triggers
 * - Take-Profit triggers
 * - Liquidation triggers
 *
 * Runs every 10 seconds to check positions
 */

interface MonitoredPosition {
  userAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  isLong: boolean;
  entryPrice: number;
  currentPrice: number;
  pnlPercent: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  liquidationPrice: number;
  collateral: string;
  leverage: number;
}

class V6PositionMonitor {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private monitorInterval = 10000; // 10 seconds

  /**
   * Start the position monitor
   */
  start() {
    if (this.isRunning) {
      logger.warn('V6 Position Monitor already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting V6 Position Monitor', { interval: this.monitorInterval / 1000 + 's' });

    // Run immediately, then on interval
    this.checkAllPositions();
    this.intervalId = setInterval(() => this.checkAllPositions(), this.monitorInterval);
  }

  /**
   * Stop the position monitor
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('V6 Position Monitor stopped');
  }

  /**
   * Check all active positions for SL/TP/Liquidation
   */
  private async checkAllPositions() {
    try {
      // Get all users with auto-trade enabled on Arbitrum
      const users = await this.getActiveV6Users();

      if (users.length === 0) {
        return;
      }

      logger.debug('Checking V6 positions', { userCount: users.length });

      const tokens = Object.entries(TOKEN_ADDRESSES);
      let triggeredCount = 0;

      for (const userAddress of users) {
        for (const [symbol, tokenAddress] of tokens) {
          try {
            const triggered = await this.checkPosition(userAddress, tokenAddress, symbol);
            if (triggered) triggeredCount++;
          } catch (err: any) {
            // Skip individual position errors
          }
        }
      }

      if (triggeredCount > 0) {
        logger.info('V6 Monitor cycle complete', { triggeredCount });
      }
    } catch (err: any) {
      logger.error('V6 Position Monitor error', { error: err.message });
    }
  }

  /**
   * Check a single position for triggers
   */
  private async checkPosition(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`,
    tokenSymbol: string
  ): Promise<boolean> {
    // Check if position exists
    const hasPosition = await vaultV6Client.hasOpenPosition(userAddress, tokenAddress);
    if (!hasPosition) return false;

    // Get position status from contract
    const { shouldClose, reason } = await vaultV6Client.checkPositionStatus(userAddress, tokenAddress);

    if (!shouldClose) return false;

    // Get position details for logging
    const position = await vaultV6Client.getPosition(userAddress, tokenAddress);
    const currentPrice = await vaultV6Client.getOraclePrice(tokenAddress);
    const { pnl, pnlPercent } = await vaultV6Client.getPositionPnL(userAddress, tokenAddress);

    const positionInfo: MonitoredPosition = {
      userAddress,
      tokenAddress,
      tokenSymbol,
      isLong: position.isLong,
      entryPrice: parseFloat(formatUnits(position.entryPrice, 8)),
      currentPrice,
      pnlPercent,
      stopLossPrice: parseFloat(formatUnits(position.stopLossPrice, 8)),
      takeProfitPrice: parseFloat(formatUnits(position.takeProfitPrice, 8)),
      liquidationPrice: parseFloat(formatUnits(position.liquidationPrice, 8)),
      collateral: formatUnits(position.collateral, 6),
      leverage: Number(position.leverage)
    };

    logger.warn(`V6 Position ${reason.toUpperCase()} triggered`, {
      user: userAddress.slice(0, 10),
      token: tokenSymbol,
      direction: position.isLong ? 'LONG' : 'SHORT',
      entryPrice: positionInfo.entryPrice.toFixed(2),
      currentPrice: currentPrice.toFixed(2),
      pnl: pnl.toFixed(2) + ' USDC',
      pnlPercent: pnlPercent.toFixed(2) + '%',
      leverage: positionInfo.leverage + 'x'
    });

    // Execute the trigger
    try {
      switch (reason) {
        case 'stoploss':
          await vaultV6Client.executeStopLoss(userAddress, tokenAddress);
          logger.info(`✅ Stop-Loss executed for ${tokenSymbol}`, { user: userAddress.slice(0, 10) });
          break;

        case 'takeprofit':
          await vaultV6Client.executeTakeProfit(userAddress, tokenAddress);
          logger.info(`✅ Take-Profit executed for ${tokenSymbol}`, { user: userAddress.slice(0, 10) });
          break;

        case 'liquidation':
          await vaultV6Client.liquidatePosition(userAddress, tokenAddress);
          logger.warn(`⚠️ Position LIQUIDATED for ${tokenSymbol}`, { user: userAddress.slice(0, 10) });
          break;
      }
      return true;
    } catch (err: any) {
      logger.error(`Failed to execute ${reason}`, {
        user: userAddress.slice(0, 10),
        token: tokenSymbol,
        error: err.message
      });
      return false;
    }
  }

  /**
   * Get all users with V6 positions (or auto-trade enabled)
   */
  private async getActiveV6Users(): Promise<`0x${string}`[]> {
    try {
      // Get users with auto-trade enabled on Arbitrum (chain 42161)
      const users = await subscriptionService.getAutoTradeUsers(42161);
      return users as `0x${string}`[];
    } catch (err) {
      logger.error('Failed to get active V6 users', { error: err });
      return [];
    }
  }

  /**
   * Get all active positions (for API/dashboard)
   */
  async getAllActivePositions(): Promise<MonitoredPosition[]> {
    const positions: MonitoredPosition[] = [];
    const users = await this.getActiveV6Users();
    const tokens = Object.entries(TOKEN_ADDRESSES);

    for (const userAddress of users) {
      for (const [symbol, tokenAddress] of tokens) {
        try {
          const hasPosition = await vaultV6Client.hasOpenPosition(userAddress, tokenAddress);
          if (!hasPosition) continue;

          const position = await vaultV6Client.getPosition(userAddress, tokenAddress);
          const currentPrice = await vaultV6Client.getOraclePrice(tokenAddress);
          const { pnlPercent } = await vaultV6Client.getPositionPnL(userAddress, tokenAddress);

          positions.push({
            userAddress,
            tokenAddress,
            tokenSymbol: symbol,
            isLong: position.isLong,
            entryPrice: parseFloat(formatUnits(position.entryPrice, 8)),
            currentPrice,
            pnlPercent,
            stopLossPrice: parseFloat(formatUnits(position.stopLossPrice, 8)),
            takeProfitPrice: parseFloat(formatUnits(position.takeProfitPrice, 8)),
            liquidationPrice: parseFloat(formatUnits(position.liquidationPrice, 8)),
            collateral: formatUnits(position.collateral, 6),
            leverage: Number(position.leverage)
          });
        } catch (err) {
          // Skip errors
        }
      }
    }

    return positions;
  }

  /**
   * Get current prices for all tokens
   */
  async getCurrentPrices(): Promise<Record<string, number>> {
    const prices: Record<string, number> = {};

    for (const [symbol, address] of Object.entries(TOKEN_ADDRESSES)) {
      try {
        prices[symbol] = await vaultV6Client.getOraclePrice(address);
      } catch (err) {
        prices[symbol] = 0;
      }
    }

    return prices;
  }
}

// Export singleton
export const v6PositionMonitor = new V6PositionMonitor();
