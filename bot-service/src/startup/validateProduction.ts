import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config';
import { logger } from '../utils/logger';
import { MONADIER_VAULT_V11_TREASURY_ADDRESS } from '../monadierVault';

const EXPECTED_BOT_ADDRESS = process.env.EXPECTED_BOT_ADDRESS as `0x${string}` | undefined;

/**
 * Fail fast on misconfiguration before any trading loop runs.
 * Hyperliquid-only: no GMX vault contract checks.
 */
export async function validateProductionEnvironment(): Promise<void> {
  const botAccount = privateKeyToAccount(config.botPrivateKey);

  if (EXPECTED_BOT_ADDRESS && botAccount.address.toLowerCase() !== EXPECTED_BOT_ADDRESS.toLowerCase()) {
    throw new Error(
      `Bot wallet mismatch: running ${botAccount.address}, expected ${EXPECTED_BOT_ADDRESS}`
    );
  }

  const envTreasuryLower = config.treasuryAddress.toLowerCase();
  if (envTreasuryLower !== MONADIER_VAULT_V11_TREASURY_ADDRESS.toLowerCase()) {
    logger.warn('TREASURY_ADDRESS differs from canonical Monadier treasury', {
      env: config.treasuryAddress,
      canonical: MONADIER_VAULT_V11_TREASURY_ADDRESS,
    });
  }

  logger.info('Production startup check (Hyperliquid bot)', {
    botWallet: botAccount.address,
    treasury: config.treasuryAddress,
    hlMinAccountUsd: config.hyperliquid.minAccountUsd,
  });

  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_SIMULATOR === 'true') {
    logger.warn('ENABLE_DEMO_SIMULATOR=true in production — demo trades will run in Supabase only');
  }
}
