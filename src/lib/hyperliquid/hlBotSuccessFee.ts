import { getHlBuilderConfig } from './builderConfig';

/** HL perp builder fee cap — 0.1% of notional (100 tenths bps), not % of profit. */
export const HL_PERP_BUILDER_MAX_TENTHS_BPS = 100;

/** Bot success fee is opt-in only; default off. */
export function hlBotSuccessFeeEnabled(): boolean {
  const cfg = getHlBuilderConfig();
  return cfg.enabled && getHlBotSuccessFeeBps() > 0;
}

export function getHlBotSuccessFeeBps(): number {
  const raw = import.meta.env.VITE_HL_BOT_SUCCESS_FEE_BPS;
  const n = raw != null && raw !== '' ? Number(raw) : 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(10_000, Math.floor(n));
}

export function formatHlBotSuccessFeePercent(): string {
  const pct = getHlBotSuccessFeeBps() / 100;
  if (pct <= 0) return '0%';
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

export function hlBotSuccessFeeShortLabel(): string {
  if (!hlBotSuccessFeeEnabled()) return 'platform builder fee';
  return `${formatHlBotSuccessFeePercent()} builder fee on notional`;
}

export function hlBotSuccessFeeApprovalTitle(): string {
  if (!hlBotSuccessFeeEnabled()) return 'Approve platform builder fee';
  return `Approve ${formatHlBotSuccessFeePercent()} builder fee cap`;
}

export function hlBotSuccessFeeStepButtonLabel(step = 2): string {
  if (!hlBotSuccessFeeEnabled()) return `${step}. Approve platform builder fee`;
  return `${step}. ${hlBotSuccessFeeApprovalTitle()}`;
}

export function hlBotSuccessFeeApprovalHint(): string {
  if (!hlBotSuccessFeeEnabled()) {
    return 'Optional Hyperliquid builder fee approval (max 0.1% of notional on perps). Bot runs without it.';
  }
  return `Hyperliquid builder fee on perp notional (protocol max 0.1%) — not a % of profit. One-time wallet approval.`;
}

export function hlBotSuccessFeeApprovalDescription(): string {
  if (!hlBotSuccessFeeEnabled()) {
    return 'No Monadier success fee on bot closes. Standard Hyperliquid trading and funding fees apply. Optional builder approval is only needed if platform fees are enabled.';
  }
  return `Optional builder fee on Hyperliquid perp notional (capped at 0.1% by HL). Monadier never gets withdrawal access — approve once in your wallet.`;
}
