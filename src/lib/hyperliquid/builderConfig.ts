import { HL_PLATFORM_DEFAULT_BUILDER } from '../hlPlatform';

/** Tenths of a basis point (10 = 1 bp = 0.01%). */
export type HlBuilderFeeTenthsBps = number;

export type HlBuilderConfig = {
  enabled: boolean;
  address: `0x${string}`;
  /** Legacy flat perp fee (tenths bps); Pro Trade opens use 0 — success fee on profitable closes only. */
  feePerp: HlBuilderFeeTenthsBps;
  feeSpotSell: HlBuilderFeeTenthsBps;
  /** Unused for perps — desk PnL stays on Hyperliquid. Kept for env compat. */
  proTradeSuccessFeeBps: number;
  maxApprovalRate: string;
  /** HIP-4 betting buy — tenths bps (500 = 0.5%). */
  bettingBuyFeeTenthsBps: HlBuilderFeeTenthsBps;
  /** HIP-4 cash out — tenths bps (2500 = 2.5%). */
  bettingCashoutFeeTenthsBps: HlBuilderFeeTenthsBps;
  bettingMaxApprovalRate: string;
};

const DEFAULT_TREASURY = HL_PLATFORM_DEFAULT_BUILDER;

function parseAddress(raw: string | undefined): `0x${string}` | null {
  const v = raw?.trim();
  if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) return null;
  if (v.toLowerCase() === HL_PLATFORM_DEFAULT_BUILDER.toLowerCase()) {
    return HL_PLATFORM_DEFAULT_BUILDER;
  }
  return v as `0x${string}`;
}

function parseFee(raw: string | undefined, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(max, Math.floor(n));
}

function parsePercentToTenthsBps(raw: string | undefined, fallback: number, max = 10_000): number {
  const m = raw?.trim().match(/^([\d.]+)\s*%?$/);
  if (!m) return fallback;
  const pct = parseFloat(m[1]);
  if (!Number.isFinite(pct) || pct <= 0) return fallback;
  return Math.min(max, Math.floor(pct * 1000));
}

export function getHlBuilderConfig(): HlBuilderConfig {
  const address =
    parseAddress(import.meta.env.VITE_HL_BUILDER_ADDRESS) ?? DEFAULT_TREASURY;
  const feePerp = parseFee(import.meta.env.VITE_HL_BUILDER_FEE_PERP, 0, 100);
  const feeSpotSell = parseFee(import.meta.env.VITE_HL_BUILDER_FEE_SPOT, 50, 1000);
  const proTradeSuccessFeeBps = Math.min(
    10_000,
    Math.max(0, Math.floor(Number(import.meta.env.VITE_HL_PRO_TRADE_SUCCESS_FEE_BPS || 0)))
  );
  const maxApprovalRate =
    import.meta.env.VITE_HL_BUILDER_MAX_APPROVAL?.trim() || '0.1%';
  const bettingBuyFeeTenthsBps = parsePercentToTenthsBps(
    import.meta.env.VITE_HL_BETTING_BUY_FEE?.trim() || '1%',
    1000,
    1000
  );
  const bettingCashoutFeeTenthsBps = parsePercentToTenthsBps(
    import.meta.env.VITE_HL_BETTING_CASHOUT_FEE?.trim() || '1%',
    1000,
    1000
  );
  const bettingMaxApprovalRate =
    import.meta.env.VITE_HL_BETTING_MAX_APPROVAL?.trim() || '1%';

  const explicitlyEnabled =
    import.meta.env.VITE_HL_BUILDER_ENABLED === 'true' ||
    import.meta.env.VITE_HL_BUILDER_ENABLED === '1';

  return {
    enabled: explicitlyEnabled && Boolean(address),
    address,
    feePerp,
    feeSpotSell,
    proTradeSuccessFeeBps,
    maxApprovalRate,
    bettingBuyFeeTenthsBps,
    bettingCashoutFeeTenthsBps,
    bettingMaxApprovalRate,
  };
}

export function formatBuilderFeeLabel(tenthsBps: number): string {
  const pct = tenthsBps / 1000;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  if (pct >= 0.001) return `${pct.toFixed(3)}%`;
  return `${pct.toFixed(4)}%`;
}
