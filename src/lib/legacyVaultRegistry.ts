import { MONADIER_VAULT_V11_ADDRESS } from './monadierVault';

/** Known Arbitrum Monadier vault contracts — temporary legacy payout scan list. */
export type LegacyVaultEntry = {
  address: `0x${string}`;
  name: string;
  /** V9+ emergencyWithdraw + getWithdrawable */
  modern: boolean;
  /** GMX-era stuck position helpers (cancelStuckPosition) */
  legacyStuckPositions: boolean;
};

export const ARBITRUM_LEGACY_VAULTS: LegacyVaultEntry[] = [
  {
    address: MONADIER_VAULT_V11_ADDRESS,
    name: 'V11 GMX Vault',
    modern: true,
    legacyStuckPositions: false,
  },
  {
    address: '0x712B3A0cFD00674a15c5D235e998F71709112675',
    name: 'V7 Original',
    modern: false,
    legacyStuckPositions: false,
  },
  {
    address: '0x9879792a47725d5b18633e1395BC4a7A06c750df',
    name: 'V7 GMX',
    modern: false,
    legacyStuckPositions: false,
  },
  {
    address: '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6',
    name: 'V8 Callback Bug',
    modern: false,
    legacyStuckPositions: true,
  },
  {
    address: '0xFA38c191134A6a3382794BE6144D24c3e6D8a4C3',
    name: 'V8 Legacy',
    modern: false,
    legacyStuckPositions: true,
  },
  {
    address: '0x6C51F75b164205e51a87038662060cfe54d95E70',
    name: 'V5',
    modern: false,
    legacyStuckPositions: false,
  },
];

export const LEGACY_VAULT_PAYOUT_ENABLED =
  import.meta.env.VITE_ENABLE_LEGACY_VAULT_PAYOUT !== 'false' &&
  import.meta.env.VITE_ENABLE_LEGACY_VAULT_PAYOUT !== '0';

export const LEGACY_VAULT_PAYOUT_PATH = '/legacy-vault-withdraw';
