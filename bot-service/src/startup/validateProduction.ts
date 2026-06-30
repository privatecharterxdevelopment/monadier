import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config';
import { logger } from '../utils/logger';
import { BRAND_DOMAIN } from '../brand';
import { fetchHlBuilderPlatformReady } from '../services/hlBuilder';

const EXPECTED_BOT_ADDRESS = process.env.EXPECTED_BOT_ADDRESS as `0x${string}` | undefined;

/**
 * Fail fast on misconfiguration before any trading loop runs.
 * Hyperliquid-only — no Arbitrum vault contract checks.
 */
export async function validateProductionEnvironment(): Promise<void> {
  const botAccount = privateKeyToAccount(config.botPrivateKey);

  if (EXPECTED_BOT_ADDRESS && botAccount.address.toLowerCase() !== EXPECTED_BOT_ADDRESS.toLowerCase()) {
    throw new Error(
      `Bot wallet mismatch: running ${botAccount.address}, expected ${EXPECTED_BOT_ADDRESS}`
    );
  }

  logger.info('Production startup check (Hyperliquid bot)', {
    botWallet: botAccount.address,
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
        action: `Deposit at least $${platform.minUsd} USDC on Hyperliquid for the builder wallet (spot counts on unified accounts).`,
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

  if (!config.email.resendApiKey) {
    logger.warn('RESEND_API_KEY not set — trade close emails will NOT send');
  } else {
    const from = config.email.from;
    logger.info('Trade close emails enabled (Resend)', { from });
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${config.email.resendApiKey}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { data?: Array<{ name: string; status: string }> };
        const domain = from.replace(/^.*@/, '').replace(/[> ].*$/, '').trim();
        const match = body.data?.find((d) => d.name === domain);
        if (!match || match.status !== 'verified') {
          logger.error(
            'RESEND DOMAIN NOT VERIFIED — trade close emails will fail until DNS is configured',
            {
              domain,
              status: match?.status ?? 'not_found',
              action: `Verify ${BRAND_DOMAIN} at https://resend.com/domains and set RESEND_FROM to a verified address.`,
            }
          );
        }
      }
    } catch {
      // non-fatal — email loop will log per-send failures
    }
  }
}
