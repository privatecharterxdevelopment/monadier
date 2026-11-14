import { config } from '../config';
import { getAutoNewEntriesBlockReason } from './liveDirectionProfile';
import {
  evaluateWalletReentry,
  resolveWalletLastBotCloseMs,
} from './hlCoinCloseGuard';
import {
  blockNewEntriesUntilReconciled,
  getWalletProtectiveReconcileStatus,
} from './hlProtectiveReconcile';
import { getLiveDirectionProfile } from './liveDirectionProfile';
import { isProfileDirectionOpenAllowed } from './profileDirectionGate';

/** Primary reason new entries are blocked — shown in bot-status and lastOpenError. */
export async function resolveHlEntryBlockReason(wallet: string): Promise<string | null> {
  const w = wallet.toLowerCase();

  const profile = getLiveDirectionProfile();
  if (!isProfileDirectionOpenAllowed('SHORT') && !isProfileDirectionOpenAllowed('LONG')) {
    return `Profile ${profile.name} — both LONG and SHORT opens disabled (check HL_ALLOW_* on Railway)`;
  }
  if (!isProfileDirectionOpenAllowed('SHORT')) {
    return `Profile ${profile.name} — SHORT signals show on scan but bot cannot open SHORT (only LONG allowed)`;
  }
  if (!isProfileDirectionOpenAllowed('LONG')) {
    return `Profile ${profile.name} — LONG opens disabled (SHORT-only mode)`;
  }

  const autoRegime = getAutoNewEntriesBlockReason();
  if (autoRegime) {
    return `BTC regime gate — new entries paused (${autoRegime})`;
  }

  if (blockNewEntriesUntilReconciled(w)) {
    const prot = getWalletProtectiveReconcileStatus(w);
  const reason = prot?.reason ?? 'protective stops not reconciled';
    return `Emergency SL reconcile — ${reason} (no new opens until fixed)`;
  }

  const cooldownMs = config.hyperliquid.reentryCooldownMs;
  if (cooldownMs > 0) {
    const lastBotClose = await resolveWalletLastBotCloseMs(w);
    const gate = evaluateWalletReentry(lastBotClose);
    if (gate.blocked && gate.reason) {
      const waitMin = Math.max(1, Math.ceil(gate.waitMs / 60_000));
      return `Wallet re-entry pause — ~${waitMin}m left (HL_REENTRY_COOLDOWN_MS is set on the server).`;
    }
  }

  return null;
}