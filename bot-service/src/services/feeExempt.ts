import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { PlatformFeeStatus } from './platformFees';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const FEE_WINS_BEFORE_BLOCK = Number(process.env.HL_FEE_WINS_BEFORE_BLOCK || 20);

/** Keep in sync with src/lib/admin.ts FEE_EXEMPT_WALLETS + platform_fee_waivers migration. */
const BUILTIN_FEE_EXEMPT_WALLETS = new Set([
  '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c',
]);

const waiverCache = new Map<string, boolean>();
let cacheLoadedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

function envExemptWallets(): Set<string> {
  const raw = process.env.HL_FEE_EXEMPT_WALLETS ?? '';
  return new Set(
    raw
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter((w) => /^0x[a-f0-9]{40}$/.test(w))
  );
}

export function isBuiltinFeeExemptWallet(walletAddress: string): boolean {
  const wallet = walletAddress.toLowerCase();
  return BUILTIN_FEE_EXEMPT_WALLETS.has(wallet) || envExemptWallets().has(wallet);
}

export async function isFeeExemptWallet(walletAddress: string): Promise<boolean> {
  const wallet = walletAddress.toLowerCase();
  if (isBuiltinFeeExemptWallet(wallet)) return true;

  const now = Date.now();
  if (now - cacheLoadedAt < CACHE_MS && waiverCache.has(wallet)) {
    return waiverCache.get(wallet) ?? false;
  }

  try {
    const { data, error } = await supabase
      .from('platform_fee_waivers')
      .select('wallet_address')
      .eq('wallet_address', wallet)
      .maybeSingle();

    if (error) {
      if (!/does not exist|relation|schema cache/i.test(error.message)) {
        logger.debug('platform_fee_waivers lookup failed', {
          wallet: wallet.slice(0, 10),
          error: error.message,
        });
      }
      return false;
    }

    const exempt = Boolean(data?.wallet_address);
    waiverCache.set(wallet, exempt);
    cacheLoadedAt = now;
    return exempt;
  } catch {
    return false;
  }
}

export function waivedPlatformFeeStatus(): PlatformFeeStatus {
  return {
    accruedUsd: 0,
    settledUsd: 0,
    builderSettledUsd: 0,
    successWinCount: 0,
    opensBlocked: false,
    withdrawBlocked: false,
    winsUntilBlock: FEE_WINS_BEFORE_BLOCK,
    successFeeBps: config.hyperliquid.successFeeBps,
    feesWaived: true,
  };
}
