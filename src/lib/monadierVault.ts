/**
 * Single source of truth — Monadier V11 GMX vault on Arbitrum.
 * Must match bot-service/src/monadierVault.ts and Railway ARBITRUM_VAULT_ADDRESS.
 */
export const MONADIER_VAULT_V11_ADDRESS =
  '0x7dE97f35887b2623dCad2ebA68197f58F7607854' as const;

export const MONADIER_VAULT_CHAIN_ID = 42161;

export const MONADIER_VAULT_LABEL = 'V11 GMX Vault';

export const MONADIER_VAULT_EXPLORER_URL =
  `https://arbiscan.io/address/${MONADIER_VAULT_V11_ADDRESS}` as const;
