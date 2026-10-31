/**
 * Aave V3 Leverage Service - Arbitrum
 *
 * Provides leverage trading via Aave V3 lending protocol.
 * Users deposit USDC as collateral, borrow more USDC, and trade with leverage.
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { logger } from '../utils/logger';

// ============================================================================
// AAVE V3 ARBITRUM ADDRESSES
// ============================================================================

export const AAVE_V3_ARBITRUM = {
  // Core contracts
  POOL: '0x794a61358D6845594F94dc1DB02A252b5b4814aD' as `0x${string}`,
  POOL_ADDRESSES_PROVIDER: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb' as `0x${string}`,

  // Tokens
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,  // Native USDC
  USDC_BRIDGED: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' as `0x${string}`, // Bridged USDC.e
  WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as `0x${string}`,

  // aTokens (interest bearing)
  aUSDC: '0x724dc807b04555b71ed48a6896b6F41593b8C637' as `0x${string}`,
  aWETH: '0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8' as `0x${string}`,

  // Variable debt tokens
  variableDebtUSDC: '0xFCCf3cAbbe80101232d343252614b6A3eE81C989' as `0x${string}`,
};

// ============================================================================
// AAVE V3 POOL ABI (minimal)
// ============================================================================

const AAVE_POOL_ABI = [
  // Supply
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' }
    ],
    name: 'supply',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Withdraw
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' }
    ],
    name: 'withdraw',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Borrow
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'referralCode', type: 'uint16' },
      { name: 'onBehalfOf', type: 'address' }
    ],
    name: 'borrow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Repay
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' }
    ],
    name: 'repay',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Get user account data
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserAccountData',
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // Get reserve data
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getReserveData',
    outputs: [
      {
        components: [
          { name: 'configuration', type: 'uint256' },
          { name: 'liquidityIndex', type: 'uint128' },
          { name: 'currentLiquidityRate', type: 'uint128' },
          { name: 'variableBorrowIndex', type: 'uint128' },
          { name: 'currentVariableBorrowRate', type: 'uint128' },
          { name: 'currentStableBorrowRate', type: 'uint128' },
          { name: 'lastUpdateTimestamp', type: 'uint40' },
          { name: 'id', type: 'uint16' },
          { name: 'aTokenAddress', type: 'address' },
          { name: 'stableDebtTokenAddress', type: 'address' },
          { name: 'variableDebtTokenAddress', type: 'address' },
          { name: 'interestRateStrategyAddress', type: 'address' },
          { name: 'accruedToTreasury', type: 'uint128' },
          { name: 'unbacked', type: 'uint128' },
          { name: 'isolationModeTotalDebt', type: 'uint128' }
        ],
        name: '',
        type: 'tuple'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// ERC20 ABI for approvals
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// ============================================================================
// TYPES
// ============================================================================

export interface AaveAccountData {
  totalCollateralUSD: number;
  totalDebtUSD: number;
  availableBorrowsUSD: number;
  liquidationThreshold: number;
  ltv: number;
  healthFactor: number;
  currentLeverage: number;
}

export interface LeveragePosition {
  collateralAmount: bigint;
  borrowedAmount: bigint;
  leverage: number;
  healthFactor: number;
}

// ============================================================================
// AAVE SERVICE CLASS
// ============================================================================

export class AaveService {
  private publicClient;
  private walletClient;
  private botAccount;

  constructor() {
    const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
    const botPrivateKey = process.env.BOT_PRIVATE_KEY;

    if (!botPrivateKey) {
      throw new Error('BOT_PRIVATE_KEY not configured');
    }

    this.botAccount = privateKeyToAccount(botPrivateKey as `0x${string}`);

    this.publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl)
    });

    this.walletClient = createWalletClient({
      chain: arbitrum,
      transport: http(rpcUrl),
      account: this.botAccount
    });
  }

  // --------------------------------------------------------------------------
  // GET USER ACCOUNT DATA
  // --------------------------------------------------------------------------

  async getUserAccountData(userAddress: `0x${string}`): Promise<AaveAccountData> {
    try {
      const result = await this.publicClient.readContract({
        address: AAVE_V3_ARBITRUM.POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'getUserAccountData',
        args: [userAddress]
      });

      const [
        totalCollateralBase,
        totalDebtBase,
        availableBorrowsBase,
        currentLiquidationThreshold,
        ltv,
        healthFactor
      ] = result;

      // Aave uses 8 decimals for USD values
      const totalCollateralUSD = parseFloat(formatUnits(totalCollateralBase, 8));
      const totalDebtUSD = parseFloat(formatUnits(totalDebtBase, 8));
      const availableBorrowsUSD = parseFloat(formatUnits(availableBorrowsBase, 8));

      // Health factor has 18 decimals
      const hf = parseFloat(formatUnits(healthFactor, 18));

      // Calculate current leverage (total exposure / collateral)
      const currentLeverage = totalCollateralUSD > 0
        ? (totalCollateralUSD + totalDebtUSD) / totalCollateralUSD
        : 1;

      return {
        totalCollateralUSD,
        totalDebtUSD,
        availableBorrowsUSD,
        liquidationThreshold: Number(currentLiquidationThreshold) / 100, // basis points to %
        ltv: Number(ltv) / 100,
        healthFactor: hf,
        currentLeverage
      };
    } catch (err) {
      logger.error('Failed to get Aave account data', { userAddress, error: err });
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // GET BORROW RATE
  // --------------------------------------------------------------------------

  async getBorrowRate(asset: `0x${string}` = AAVE_V3_ARBITRUM.USDC): Promise<number> {
    try {
      const result = await this.publicClient.readContract({
        address: AAVE_V3_ARBITRUM.POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'getReserveData',
        args: [asset]
      });

      // Variable borrow rate is in RAY (27 decimals), convert to APY %
      const variableBorrowRate = result.currentVariableBorrowRate;
      const ratePercent = parseFloat(formatUnits(variableBorrowRate, 27)) * 100;

      return ratePercent;
    } catch (err) {
      logger.error('Failed to get borrow rate', { asset, error: err });
      return 5; // Default 5% if can't fetch
    }
  }

  // --------------------------------------------------------------------------
  // APPROVE TOKEN FOR AAVE
  // --------------------------------------------------------------------------

  async approveToken(
    token: `0x${string}`,
    amount: bigint,
    userAddress: `0x${string}`
  ): Promise<string> {
    try {
      // Check current allowance
      const allowance = await this.publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [userAddress, AAVE_V3_ARBITRUM.POOL]
      });

      if (allowance >= amount) {
        logger.debug('Token already approved for Aave', { token, allowance: allowance.toString() });
        return 'already_approved';
      }

      // Approve max amount
      const txHash = await this.walletClient.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [AAVE_V3_ARBITRUM.POOL, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')]
      });

      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      logger.info('Token approved for Aave', { token, txHash });
      return txHash;
    } catch (err) {
      logger.error('Failed to approve token', { token, error: err });
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // SUPPLY COLLATERAL
  // --------------------------------------------------------------------------

  async supplyCollateral(
    userAddress: `0x${string}`,
    amount: bigint,
    asset: `0x${string}` = AAVE_V3_ARBITRUM.USDC
  ): Promise<string> {
    try {
      logger.info('Supplying collateral to Aave', {
        userAddress: userAddress.slice(0, 10),
        amount: formatUnits(amount, 6),
        asset
      });

      const txHash = await this.walletClient.writeContract({
        address: AAVE_V3_ARBITRUM.POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'supply',
        args: [asset, amount, userAddress, 0]
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status !== 'success') {
        throw new Error('Supply transaction reverted');
      }

      logger.info('Collateral supplied successfully', { txHash, amount: formatUnits(amount, 6) });
      return txHash;
    } catch (err) {
      logger.error('Failed to supply collateral', { error: err });
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // BORROW
  // --------------------------------------------------------------------------

  async borrow(
    userAddress: `0x${string}`,
    amount: bigint,
    asset: `0x${string}` = AAVE_V3_ARBITRUM.USDC
  ): Promise<string> {
    try {
      // Check health factor before borrowing
      const accountData = await this.getUserAccountData(userAddress);

      const borrowAmountUSD = parseFloat(formatUnits(amount, 6));
      const newDebt = accountData.totalDebtUSD + borrowAmountUSD;
      const estimatedHF = (accountData.totalCollateralUSD * accountData.liquidationThreshold / 100) / newDebt;

      if (estimatedHF < 1.5) {
        throw new Error(`Borrow would bring health factor too low: ${estimatedHF.toFixed(2)}`);
      }

      logger.info('Borrowing from Aave', {
        userAddress: userAddress.slice(0, 10),
        amount: formatUnits(amount, 6),
        estimatedHF: estimatedHF.toFixed(2)
      });

      // Interest rate mode: 2 = variable
      const txHash = await this.walletClient.writeContract({
        address: AAVE_V3_ARBITRUM.POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'borrow',
        args: [asset, amount, 2n, 0, userAddress]
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status !== 'success') {
        throw new Error('Borrow transaction reverted');
      }

      logger.info('Borrowed successfully', { txHash, amount: formatUnits(amount, 6) });
      return txHash;
    } catch (err) {
      logger.error('Failed to borrow', { error: err });
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // REPAY
  // --------------------------------------------------------------------------

  async repay(
    userAddress: `0x${string}`,
    amount: bigint,
    asset: `0x${string}` = AAVE_V3_ARBITRUM.USDC
  ): Promise<string> {
    try {
      logger.info('Repaying Aave loan', {
        userAddress: userAddress.slice(0, 10),
        amount: formatUnits(amount, 6)
      });

      // Approve repayment
      await this.approveToken(asset, amount, userAddress);

      // Interest rate mode: 2 = variable
      const txHash = await this.walletClient.writeContract({
        address: AAVE_V3_ARBITRUM.POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'repay',
        args: [asset, amount, 2n, userAddress]
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status !== 'success') {
        throw new Error('Repay transaction reverted');
      }

      logger.info('Repaid successfully', { txHash, amount: formatUnits(amount, 6) });
      return txHash;
    } catch (err) {
      logger.error('Failed to repay', { error: err });
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // WITHDRAW COLLATERAL
  // --------------------------------------------------------------------------

  async withdrawCollateral(
    userAddress: `0x${string}`,
    amount: bigint,
    asset: `0x${string}` = AAVE_V3_ARBITRUM.USDC
  ): Promise<string> {
    try {
      // Check if withdrawal is safe
      const accountData = await this.getUserAccountData(userAddress);
      const withdrawAmountUSD = parseFloat(formatUnits(amount, 6));
      const newCollateral = accountData.totalCollateralUSD - withdrawAmountUSD;

      if (accountData.totalDebtUSD > 0) {
        const newHF = (newCollateral * accountData.liquidationThreshold / 100) / accountData.totalDebtUSD;
        if (newHF < 1.5) {
          throw new Error(`Withdrawal would bring health factor too low: ${newHF.toFixed(2)}`);
        }
      }

      logger.info('Withdrawing collateral from Aave', {
        userAddress: userAddress.slice(0, 10),
        amount: formatUnits(amount, 6)
      });

      const txHash = await this.walletClient.writeContract({
        address: AAVE_V3_ARBITRUM.POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'withdraw',
        args: [asset, amount, userAddress]
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status !== 'success') {
        throw new Error('Withdraw transaction reverted');
      }

      logger.info('Collateral withdrawn successfully', { txHash, amount: formatUnits(amount, 6) });
      return txHash;
    } catch (err) {
      logger.error('Failed to withdraw collateral', { error: err });
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // CALCULATE LEVERAGE PARAMETERS
  // --------------------------------------------------------------------------

  /**
   * Calculate how much to borrow for target leverage
   * @param collateralAmount - Amount of USDC to deposit
   * @param targetLeverage - Target leverage (e.g., 2 for 2x, 3 for 3x)
   * @returns Amount to borrow
   */
  calculateBorrowForLeverage(collateralAmount: bigint, targetLeverage: number): bigint {
    // For 2x leverage: borrow = collateral * 1
    // For 3x leverage: borrow = collateral * 2
    // Formula: borrow = collateral * (leverage - 1)

    if (targetLeverage < 1) {
      return 0n;
    }

    const multiplier = targetLeverage - 1;
    const collateralNum = Number(formatUnits(collateralAmount, 6));
    const borrowNum = collateralNum * multiplier;

    return parseUnits(borrowNum.toFixed(6), 6);
  }

  /**
   * Calculate effective trading amount with leverage
   */
  calculateEffectiveAmount(collateralAmount: bigint, leverage: number): bigint {
    const collateralNum = Number(formatUnits(collateralAmount, 6));
    const effectiveNum = collateralNum * leverage;
    return parseUnits(effectiveNum.toFixed(6), 6);
  }

  /**
   * Check if target leverage is safe
   */
  async isLeverageSafe(
    userAddress: `0x${string}`,
    additionalCollateral: bigint,
    additionalBorrow: bigint
  ): Promise<{ safe: boolean; estimatedHF: number }> {
    const accountData = await this.getUserAccountData(userAddress);

    const newCollateral = accountData.totalCollateralUSD + parseFloat(formatUnits(additionalCollateral, 6));
    const newDebt = accountData.totalDebtUSD + parseFloat(formatUnits(additionalBorrow, 6));

    if (newDebt === 0) {
      return { safe: true, estimatedHF: 999 };
    }

    const estimatedHF = (newCollateral * accountData.liquidationThreshold / 100) / newDebt;

    return {
      safe: estimatedHF >= 1.5,
      estimatedHF
    };
  }

  // --------------------------------------------------------------------------
  // OPEN LEVERAGED POSITION
  // --------------------------------------------------------------------------

  /**
   * Open a leveraged position:
   * 1. Supply collateral to Aave
   * 2. Borrow additional USDC
   * 3. Return total amount available for trading
   */
  async openLeveragedPosition(
    userAddress: `0x${string}`,
    collateralAmount: bigint,
    targetLeverage: number
  ): Promise<{
    success: boolean;
    collateralSupplied: bigint;
    amountBorrowed: bigint;
    totalTradingAmount: bigint;
    healthFactor: number;
    error?: string;
  }> {
    try {
      // Validate leverage (max 3x for safety)
      if (targetLeverage > 3) {
        return {
          success: false,
          collateralSupplied: 0n,
          amountBorrowed: 0n,
          totalTradingAmount: 0n,
          healthFactor: 0,
          error: 'Maximum leverage is 3x for safety'
        };
      }

      if (targetLeverage <= 1) {
        // No leverage needed
        return {
          success: true,
          collateralSupplied: 0n,
          amountBorrowed: 0n,
          totalTradingAmount: collateralAmount,
          healthFactor: 999
        };
      }

      const borrowAmount = this.calculateBorrowForLeverage(collateralAmount, targetLeverage);

      // Check if leverage is safe
      const { safe, estimatedHF } = await this.isLeverageSafe(userAddress, collateralAmount, borrowAmount);

      if (!safe) {
        return {
          success: false,
          collateralSupplied: 0n,
          amountBorrowed: 0n,
          totalTradingAmount: 0n,
          healthFactor: estimatedHF,
          error: `Leverage would result in unsafe health factor: ${estimatedHF.toFixed(2)}`
        };
      }

      logger.info('Opening leveraged position', {
        userAddress: userAddress.slice(0, 10),
        collateral: formatUnits(collateralAmount, 6),
        borrow: formatUnits(borrowAmount, 6),
        leverage: targetLeverage + 'x',
        estimatedHF: estimatedHF.toFixed(2)
      });

      // 1. Supply collateral
      await this.supplyCollateral(userAddress, collateralAmount);

      // 2. Borrow
      await this.borrow(userAddress, borrowAmount);

      // 3. Get final health factor
      const finalData = await this.getUserAccountData(userAddress);

      const totalTradingAmount = collateralAmount + borrowAmount;

      logger.info('Leveraged position opened', {
        collateral: formatUnits(collateralAmount, 6),
        borrowed: formatUnits(borrowAmount, 6),
        total: formatUnits(totalTradingAmount, 6),
        healthFactor: finalData.healthFactor.toFixed(2),
        leverage: targetLeverage + 'x'
      });

      return {
        success: true,
        collateralSupplied: collateralAmount,
        amountBorrowed: borrowAmount,
        totalTradingAmount,
        healthFactor: finalData.healthFactor
      };
    } catch (err: any) {
      logger.error('Failed to open leveraged position', { error: err });
      return {
        success: false,
        collateralSupplied: 0n,
        amountBorrowed: 0n,
        totalTradingAmount: 0n,
        healthFactor: 0,
        error: err.message || 'Failed to open leveraged position'
      };
    }
  }

  // --------------------------------------------------------------------------
  // CLOSE LEVERAGED POSITION
  // --------------------------------------------------------------------------

  /**
   * Close a leveraged position:
   * 1. Repay the borrowed amount
   * 2. Withdraw collateral
   */
  async closeLeveragedPosition(
    userAddress: `0x${string}`,
    repayAmount: bigint,
    withdrawAmount: bigint
  ): Promise<{
    success: boolean;
    repaid: bigint;
    withdrawn: bigint;
    error?: string;
  }> {
    try {
      logger.info('Closing leveraged position', {
        userAddress: userAddress.slice(0, 10),
        repay: formatUnits(repayAmount, 6),
        withdraw: formatUnits(withdrawAmount, 6)
      });

      // 1. Repay loan
      if (repayAmount > 0n) {
        await this.repay(userAddress, repayAmount);
      }

      // 2. Withdraw collateral
      if (withdrawAmount > 0n) {
        await this.withdrawCollateral(userAddress, withdrawAmount);
      }

      logger.info('Leveraged position closed', {
        repaid: formatUnits(repayAmount, 6),
        withdrawn: formatUnits(withdrawAmount, 6)
      });

      return {
        success: true,
        repaid: repayAmount,
        withdrawn: withdrawAmount
      };
    } catch (err: any) {
      logger.error('Failed to close leveraged position', { error: err });
      return {
        success: false,
        repaid: 0n,
        withdrawn: 0n,
        error: err.message || 'Failed to close leveraged position'
      };
    }
  }
}

// Export singleton instance
export const aaveService = new AaveService();
