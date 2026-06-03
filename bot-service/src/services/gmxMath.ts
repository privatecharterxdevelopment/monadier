import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import { config } from '../config';
import { logger } from '../utils/logger';
import { MONADIER_VAULT_V11_ADDRESS } from '../monadierVault';

const GMX_VAULT = '0x489ee077994B6658eAfA855C308275EAd8097C4A' as const;
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;

const GMX_POSITION_ABI = parseAbi([
  'function getPosition(address _account, address _collateralToken, address _indexToken, bool _isLong) view returns (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, uint256 reserveAmount, int256 realisedPnl, uint256 lastIncreasedTime)',
  'function getMaxPrice(address _token) view returns (uint256)',
  'function getMinPrice(address _token) view returns (uint256)',
]);

export interface GmxPerpPosition {
  size: bigint;
  collateral: bigint;
  averagePrice: bigint;
  realisedPnl: bigint;
  isLong: boolean;
  indexToken: `0x${string}`;
}

export interface GmxUnrealizedPnl {
  /** USDC-scale (6 decimals) — matches V7 on-chain formula output */
  pnl: bigint;
  /** Basis points relative to GMX collateral */
  pnlPercentBps: bigint;
  markPrice: bigint;
  averagePrice: bigint;
  size: bigint;
  collateral: bigint;
}

const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http(config.arbitrum.rpcUrl),
});

/**
 * Read live GMX perp state for the V11 vault as account.
 */
export async function fetchGmxPerpPosition(
  indexToken: `0x${string}`,
  isLong: boolean
): Promise<GmxPerpPosition | null> {
  try {
    const row = await publicClient.readContract({
      address: GMX_VAULT,
      abi: GMX_POSITION_ABI,
      functionName: 'getPosition',
      args: [MONADIER_VAULT_V11_ADDRESS, USDC, indexToken, isLong],
    });

    return {
      size: row[0],
      collateral: row[1],
      averagePrice: row[2],
      realisedPnl: row[5],
      isLong,
      indexToken,
    };
  } catch (err: any) {
    logger.error('fetchGmxPerpPosition failed', { error: err.message });
    return null;
  }
}

/**
 * Mark price for P/L — longs exit at min, shorts at max (GMX convention).
 */
export async function getGmxMarkPrice(
  indexToken: `0x${string}`,
  isLong: boolean
): Promise<bigint> {
  if (isLong) {
    return publicClient.readContract({
      address: GMX_VAULT,
      abi: GMX_POSITION_ABI,
      functionName: 'getMinPrice',
      args: [indexToken],
    });
  }
  return publicClient.readContract({
    address: GMX_VAULT,
    abi: GMX_POSITION_ABI,
    functionName: 'getMaxPrice',
    args: [indexToken],
  });
}

/**
 * Unrealized P/L using GMX size + averagePrice (same math as MonadierTradingVaultV7).
 */
export function calculateGmxUnrealizedPnl(
  position: GmxPerpPosition,
  markPrice: bigint
): GmxUnrealizedPnl {
  const { size, collateral, averagePrice } = position;

  if (size === 0n || averagePrice === 0n) {
    return {
      pnl: 0n,
      pnlPercentBps: 0n,
      markPrice,
      averagePrice,
      size,
      collateral,
    };
  }

  let pnl: bigint;
  if (position.isLong) {
    if (markPrice > averagePrice) {
      pnl = (size * (markPrice - averagePrice)) / averagePrice;
    } else {
      pnl = -((size * (averagePrice - markPrice)) / averagePrice);
    }
  } else if (markPrice < averagePrice) {
    pnl = (size * (averagePrice - markPrice)) / averagePrice;
  } else {
    pnl = -((size * (markPrice - averagePrice)) / averagePrice);
  }

  const pnlPercentBps = collateral > 0n ? (pnl * 10000n) / collateral : 0n;

  return {
    pnl,
    pnlPercentBps,
    markPrice,
    averagePrice,
    size,
    collateral,
  };
}

/**
 * Human-readable helpers for DB / logs.
 */
export function gmxPriceToNumber(price: bigint): number {
  return Number(formatUnits(price, 30));
}

export function gmxPnlToUsd(pnl: bigint): number {
  return Number(pnl) / 1e6;
}

export function gmxPnlBpsToPercent(bps: bigint): number {
  return Number(bps) / 100;
}
