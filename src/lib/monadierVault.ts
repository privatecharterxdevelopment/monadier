/**
 * Single source of truth — Monadier V11 GMX vault on Arbitrum.
 * Must match bot-service/src/monadierVault.ts and Railway ARBITRUM_VAULT_ADDRESS.
 */
export const MONADIER_VAULT_V11_ADDRESS =
  '0x7dE97f35887b2623dCad2ebA68197f58F7607854' as const;

/** Immutable bot wallet on V11 — receives 0.1% deposit fee; must match BOT_PRIVATE_KEY on Railway. */
export const MONADIER_VAULT_V11_BOT_ADDRESS =
  '0xF7072A1067194648f309A215250004abe177531a' as const;

/** Treasury on V11 — subscription payments and platform fees must use this address. */
export const MONADIER_VAULT_V11_TREASURY_ADDRESS =
  '0x64d79e57640A8d4A56Ad1d08c932B5CCF0B263a9' as const;

export const MONADIER_VAULT_CHAIN_ID = 42161;

export const MONADIER_VAULT_LABEL = 'V11 GMX Vault';

export const MONADIER_VAULT_EXPLORER_URL =
  `https://arbiscan.io/address/${MONADIER_VAULT_V11_ADDRESS}` as const;
