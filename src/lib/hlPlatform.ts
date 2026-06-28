/** Hyperliquid-only platform addresses (env overrides in builderConfig / Railway). */

export const ARBITRUM_ONE_CHAIN_ID = 42161;

/** Default HL builder fee wallet — override via VITE_HL_BUILDER_ADDRESS / HL_BUILDER_ADDRESS. */
export const HL_PLATFORM_DEFAULT_BUILDER =
  '0x1fbc2a0ab6a8fa5f6b9645392433483b25a8cd84' as const;
