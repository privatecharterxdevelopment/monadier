import { privateKeyToAccount } from 'viem/accounts';
import { config, PLATFORM_FEE_RECEIVER_ADDRESS } from '../config';
import { logger } from '../utils/logger';
import { fetchHlBuilderPlatformReady } from '../services/hlBuilder';

const EXPECTED_BOT_ADDRESS = process.env.EXPECTED_BOT_ADDRESS as `0x${string}` | undefined;
const LEGACY_VAULT_TREASURY = '0x64d79e57640a8d4a56ad1d08c932b5ccf0b263a9';

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

  const feeReceiver = config.treasuryAddress.toLowerCase();
  if (feeReceiver === LEGACY_VAULT_TREASURY) {
    throw new Error(
      `Platform fee receiver is still the legacy vault treasury ${LEGACY_VAULT_TREASURY}. ` +
        `Set PLATFORM_FEE_TREASURY_ADDRESS=${PLATFORM_FEE_RECEIVER_ADDRESS} (admin builder wallet).`
    );
  }
  if (feeReceiver !== PLATFORM_FEE_RECEIVER_ADDRESS.toLowerCase()) {
    logger.warn('Platform fee receiver differs from canonical admin builder wallet', {
      feeReceiver: config.treasuryAddress,
      canonical: PLATFORM_FEE_RECEIVER_ADDRESS,
    });
  }

  logger.info('Production startup check (Hyperliquid bot)', {
    botWallet: botAccount.address,
    treasury: config.treasuryAddress,
    hlBuilder: config.hyperliquid.builderAddress,
    hlMinAccountUsd: config.hyperliquid.minAccountUsd,
  });

  const builder = config.hyperliquid.builderAddress;
  if (builder) {
    const platform = await fetchHlBuilderPlatformReady(builder);
    if (!platform.ready) {
      logger.error('HL BUILDER WALLET NOT FUNDED — success fees and betting fees will NOT collect', {
        builderAddress: platform.builderAddress,
        accountUsd: platform.accountUsd,
        requiredUsd: platform.minUsd,
        action: `Deposit at least $${platform.minUsd} USDC to this address on Hyperliquid (perps account, not Arbitrum).`,
      });
    } else {
      logger.info('HL builder wallet ready — fee collection active', {
        builderAddress: platform.builderAddress,
        accountUsd: platform.accountUsd,
      });
    }
  } else {
    logger.warn('HL_BUILDER_ADDRESS not set — platform fees disabled');
  }

  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_SIMULATOR === 'true') {
    logger.warn('ENABLE_DEMO_SIMULATOR=true in production — demo trades will run in Supabase only');
  }
}
