/** User-facing copy for HL bot success fee (default 10% of profit on winning closes). */

const DEFAULT_BOT_SUCCESS_FEE_BPS = 1000;

export function getHlBotSuccessFeeBps(): number {
  const raw = import.meta.env.VITE_HL_BOT_SUCCESS_FEE_BPS;
  const n = raw != null && raw !== '' ? Number(raw) : DEFAULT_BOT_SUCCESS_FEE_BPS;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BOT_SUCCESS_FEE_BPS;
  return Math.min(10_000, Math.floor(n));
}

/** e.g. "10%" */
export function formatHlBotSuccessFeePercent(): string {
  const pct = getHlBotSuccessFeeBps() / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

/** Primary label — what users actually pay. */
export function hlBotSuccessFeeShortLabel(): string {
  return `${formatHlBotSuccessFeePercent()} success fee on wins`;
}

/** Button / modal title. */
export function hlBotSuccessFeeApprovalTitle(): string {
  return `Approve ${formatHlBotSuccessFeePercent()} success fee`;
}

/** Step button with order prefix. */
export function hlBotSuccessFeeStepButtonLabel(step = 2): string {
  return `${step}. Approve ${formatHlBotSuccessFeePercent()} success fee`;
}

/** One-line explanation for tooltips and status text. */
export function hlBotSuccessFeeApprovalHint(): string {
  return `${formatHlBotSuccessFeePercent()} of profit on profitable bot closes only — no fee on losses. One-time Hyperliquid wallet approval.`;
}

/** Longer copy for modals / setup steps. */
export function hlBotSuccessFeeApprovalDescription(): string {
  return `Monadier charges a ${formatHlBotSuccessFeePercent()} success fee when the bot closes a trade in profit. Losing closes are free. You approve once in your wallet — Monadier never gets withdrawal access.`;
}
