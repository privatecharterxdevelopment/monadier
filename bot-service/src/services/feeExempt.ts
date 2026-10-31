import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

/** Keep in sync with src/lib/admin.ts — Lorenzo only. */
const BUILTIN_FEE_EXEMPT_WALLETS = new Set([
  '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c',
  '0x492402bd607a72cbf0a90280aae9b7905372829c',
]);

/** Keep in sync with src/lib/admin.ts FEE_EXEMPT_EMAILS — Lorenzo only. */
const BUILTIN_FEE_EXEMPT_EMAILS = new Set([
  'lorenzo.vanza@hotmail.com',
  'ipsunlorem@gmail.com',
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

function envExemptEmails(): Set<string> {
  const raw = process.env.HL_FEE_EXEMPT_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isBuiltinFeeExemptWallet(walletAddress: string): boolean {
  const wallet = walletAddress.toLowerCase();
  return BUILTIN_FEE_EXEMPT_WALLETS.has(wallet) || envExemptWallets().has(wallet);
}

async function isWalletLinkedToExemptEmail(wallet: string): Promise<boolean> {
  const exemptEmails = new Set([
    ...BUILTIN_FEE_EXEMPT_EMAILS,
    ...envExemptEmails(),
  ]);
  if (!exemptEmails.size) return false;

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .ilike('wallet_address', wallet)
      .maybeSingle();
    if (profile?.email && exemptEmails.has(String(profile.email).toLowerCase())) {
      return true;
    }

    const { data: links } = await supabase
      .from('user_wallets')
      .select('user_id')
      .ilike('wallet_address', wallet)
      .limit(5);
    const userIds = (links ?? [])
      .map((row) => row.user_id)
      .filter(Boolean);
    if (!userIds.length) return false;

    const { data: profiles } = await supabase
      .from('profiles')
      .select('email')
      .in('id', userIds);
    return (profiles ?? []).some(
      (row) => row.email && exemptEmails.has(String(row.email).toLowerCase()),
    );
  } catch (error) {
    logger.debug('fee-exempt email lookup failed', {
      wallet: wallet.slice(0, 10),
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function isFeeExemptWallet(walletAddress: string): Promise<boolean> {
  const wallet = walletAddress.toLowerCase();
  if (isBuiltinFeeExemptWallet(wallet)) return true;

  const now = Date.now();
  if (now - cacheLoadedAt < CACHE_MS && waiverCache.has(wallet)) {
    return waiverCache.get(wallet) ?? false;
  }

  try {
    if (await isWalletLinkedToExemptEmail(wallet)) {
      waiverCache.set(wallet, true);
      cacheLoadedAt = now;
      return true;
    }

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
