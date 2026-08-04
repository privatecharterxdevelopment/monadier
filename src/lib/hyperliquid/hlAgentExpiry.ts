/** Hyperliquid agent approval expiry helpers (on-chain ~90d). */

/** Warn / prompt renew this many days before validUntil. */
export const HL_AGENT_RENEW_WITHIN_DAYS = 14;

export function hlAgentMsUntilExpiry(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return null;
  return t - Date.now();
}

export function hlAgentDaysUntilExpiry(expiresAt: string | null | undefined): number | null {
  const ms = hlAgentMsUntilExpiry(expiresAt);
  if (ms == null) return null;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function isHlAgentExpired(expiresAt: string | null | undefined): boolean {
  const ms = hlAgentMsUntilExpiry(expiresAt);
  if (ms == null) return false;
  return ms <= 0;
}

/** Still valid, but inside renew window — user should re-sign approveAgent. */
export function isHlAgentExpiringSoon(
  expiresAt: string | null | undefined,
  withinDays = HL_AGENT_RENEW_WITHIN_DAYS
): boolean {
  const ms = hlAgentMsUntilExpiry(expiresAt);
  if (ms == null) return false;
  if (ms <= 0) return false;
  return ms <= withinDays * 24 * 60 * 60 * 1000;
}

export function hlAgentNeedsRenew(
  approved: boolean,
  expiresAt: string | null | undefined,
  withinDays = HL_AGENT_RENEW_WITHIN_DAYS
): boolean {
  if (!approved) return true;
  if (isHlAgentExpired(expiresAt)) return true;
  return isHlAgentExpiringSoon(expiresAt, withinDays);
}
