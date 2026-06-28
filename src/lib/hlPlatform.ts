/** Hyperliquid-only platform addresses (env overrides in builderConfig / Railway). */

export const ARBITRUM_ONE_CHAIN_ID = 42161;

/** Default HL builder fee wallet — override via VITE_HL_BUILDER_ADDRESS / HL_BUILDER_ADDRESS. */
export const HL_PLATFORM_DEFAULT_BUILDER =
  '0x64d79e57640A8d4A56Ad1d08c932B5CCF0B263a9' as const;
