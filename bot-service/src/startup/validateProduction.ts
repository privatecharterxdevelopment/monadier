import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  MONADIER_VAULT_V11_ADDRESS,
  MONADIER_VAULT_V11_BOT_ADDRESS,
  MONADIER_VAULT_V11_TREASURY_ADDRESS,
  MONADIER_VAULT_CHAIN_ID,
  MONADIER_VAULT_LABEL,
} from '../monadierVault';

const VAULT_HEALTH_ABI = parseAbi([
  'function getHealthStatus() view returns (uint256 realBalance, uint256 totalValueLocked, bool isSolvent, int256 surplus)',
  'function bot() view returns (address)',
  'function treasury() view returns (address)',
]);

const EXPECTED_BOT_ADDRESS = process.env.EXPECTED_BOT_ADDRESS as `0x${string}` | undefined;

/**
 * Fail fast on misconfiguration before any trading loop runs.
 */
export async function validateProductionEnvironment(): Promise<void> {
  const vault = config.arbitrum.vaultAddress;
  const botAccount = privateKeyToAccount(config.botPrivateKey);

  if (vault.toLowerCase() !== MONADIER_VAULT_V11_ADDRESS.toLowerCase()) {
    logger.warn('Vault address differs from canonical V11 — verify ARBITRUM_VAULT_ADDRESS', {
      configured: vault,
      canonical: MONADIER_VAULT_V11_ADDRESS,
    });
  }

  if (EXPECTED_BOT_ADDRESS && botAccount.address.toLowerCase() !== EXPECTED_BOT_ADDRESS.toLowerCase()) {
    throw new Error(
      `Bot wallet mismatch: running ${botAccount.address}, expected ${EXPECTED_BOT_ADDRESS}`
    );
  }

  const client = createPublicClient({
    chain: arbitrum,
    transport: http(config.arbitrum.rpcUrl),
  });

  const bytecode = await client.getBytecode({ address: vault });
  if (!bytecode || bytecode === '0x') {
    throw new Error(`No contract bytecode at vault ${vault} — wrong network or address`);
  }

  const [health, onChainBot, onChainTreasury] = await Promise.all([
    client.readContract({
      address: vault,
      abi: VAULT_HEALTH_ABI,
      functionName: 'getHealthStatus',
    }),
    client.readContract({
      address: vault,
      abi: VAULT_HEALTH_ABI,
      functionName: 'bot',
    }),
    client.readContract({
      address: vault,
      abi: VAULT_HEALTH_ABI,
      functionName: 'treasury',
    }),
  ]);

  const [realBalance, tvl, isSolvent, surplus] = health;

  const botLower = botAccount.address.toLowerCase();
  const onChainBotLower = (onChainBot as string).toLowerCase();
  const envTreasuryLower = config.treasuryAddress.toLowerCase();
  const onChainTreasuryLower = (onChainTreasury as string).toLowerCase();

  if (onChainBotLower !== botLower) {
    throw new Error(
      `CRITICAL SECURITY: BOT_PRIVATE_KEY wallet ${botAccount.address} does not match vault.bot() ${onChainBot}. ` +
        'Deposits would send fees to the wrong address. Fix BOT_PRIVATE_KEY or redeploy vault.'
    );
  }

  if (onChainBotLower !== MONADIER_VAULT_V11_BOT_ADDRESS.toLowerCase()) {
    logger.warn('On-chain bot differs from canonical V11 bot — verify contract is authentic', {
      onChain: onChainBot,
      canonical: MONADIER_VAULT_V11_BOT_ADDRESS,
    });
  }

  if (envTreasuryLower !== onChainTreasuryLower) {
    throw new Error(
      `CRITICAL SECURITY: TREASURY_ADDRESS env ${config.treasuryAddress} does not match vault.treasury() ${onChainTreasury}. ` +
        'Subscription payments would be credited to the wrong wallet.'
    );
  }

  if (onChainTreasuryLower !== MONADIER_VAULT_V11_TREASURY_ADDRESS.toLowerCase()) {
    logger.warn('On-chain treasury differs from canonical V11 treasury', {
      onChain: onChainTreasury,
      canonical: MONADIER_VAULT_V11_TREASURY_ADDRESS,
    });
  }

  logger.info('Production vault check', {
    label: MONADIER_VAULT_LABEL,
    vault,
    chainId: MONADIER_VAULT_CHAIN_ID,
    botWallet: botAccount.address,
    onChainBot,
    onChainTreasury,
    envTreasury: config.treasuryAddress,
    realUsdc: formatUnits(realBalance, 6),
    tvlUsdc: formatUnits(tvl, 6),
    isSolvent,
    surplusUsdc: formatUnits(surplus, 6),
    arbiscan: `https://arbiscan.io/address/${vault}`,
  });

  if (!isSolvent) {
    logger.error('VAULT IS INSOLVENT — pause new opens until USDC is restored or TVL corrected', {
      deficitUsdc: formatUnits(-surplus, 6),
    });
  }

  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_SIMULATOR === 'true') {
    logger.warn('ENABLE_DEMO_SIMULATOR=true in production — demo trades will run in Supabase only');
  }
}
