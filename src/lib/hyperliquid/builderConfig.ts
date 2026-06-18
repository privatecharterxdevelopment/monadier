import { MONADIER_VAULT_V11_TREASURY_ADDRESS } from '../monadierVault';

/** Tenths of a basis point (10 = 1 bp = 0.01%). */
export type HlBuilderFeeTenthsBps = number;

export type HlBuilderConfig = {
  enabled: boolean;
  address: `0x${string}`;
  /** Legacy flat perp fee (tenths bps); Pro Trade opens use 0 — success fee on profitable closes only. */
  feePerp: HlBuilderFeeTenthsBps;
  feeSpotSell: HlBuilderFeeTenthsBps;
  /** Manual Pro Trade: bps of profit on winning closes (250 = 2.5%). */
  proTradeSuccessFeeBps: number;
  maxApprovalRate: string;
};

const DEFAULT_TREASURY = MONADIER_VAULT_V11_TREASURY_ADDRESS.toLowerCase() as `0x${string}`;

function parseAddress(raw: string | undefined): `0x${string}` | null {
  const v = raw?.trim().toLowerCase();
  if (!v || !/^0x[a-f0-9]{40}$/.test(v)) return null;
  return v as `0x${string}`;
}

function parseFee(raw: string | undefined, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(max, Math.floor(n));
}

export function getHlBuilderConfig(): HlBuilderConfig {
  const address =
    parseAddress(import.meta.env.VITE_HL_BUILDER_ADDRESS) ?? DEFAULT_TREASURY;
  const feePerp = parseFee(import.meta.env.VITE_HL_BUILDER_FEE_PERP, 0, 100);
  const feeSpotSell = parseFee(import.meta.env.VITE_HL_BUILDER_FEE_SPOT, 50, 1000);
  const proTradeSuccessFeeBps = Math.min(
    10_000,
    Math.max(0, Math.floor(Number(import.meta.env.VITE_HL_PRO_TRADE_SUCCESS_FEE_BPS || 250)))
  );
  const maxApprovalRate =
    import.meta.env.VITE_HL_BUILDER_MAX_APPROVAL?.trim() || '0.1%';

  const explicitlyDisabled =
    import.meta.env.VITE_HL_BUILDER_ENABLED === 'false' ||
    import.meta.env.VITE_HL_BUILDER_ENABLED === '0';

  return {
    enabled: !explicitlyDisabled && Boolean(address),
    address,
    feePerp,
    feeSpotSell,
    proTradeSuccessFeeBps,
    maxApprovalRate,
  };
}

export function formatBuilderFeeLabel(tenthsBps: number): string {
  const pct = tenthsBps / 1000;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  if (pct >= 0.001) return `${pct.toFixed(3)}%`;
  return `${pct.toFixed(4)}%`;
}
