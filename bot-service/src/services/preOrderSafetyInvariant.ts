/**
 * Last-line check before an HL open order: current side must have fresh PASS
 * receipts for location quality, wick, S/R, HTF, and Vision. No recalculation.
 */
import { logger } from '../utils/logger';

export const PRE_ORDER_SAFETY_GATES = [
  'entryLocationQuality',
  'wick',
  'sr',
  'htfSr',
  'vision',
] as const;

export type PreOrderSafetyGate = (typeof PRE_ORDER_SAFETY_GATES)[number];

export type OpenSafetyCard = {
  originalSide: 'LONG' | 'SHORT';
  side: 'LONG' | 'SHORT';
  /** Side that last PASSed each gate. Missing/stale/other-side = fail. */
  passes: Partial<Record<PreOrderSafetyGate, 'LONG' | 'SHORT'>>;
};

export function createOpenSafetyCard(side: 'LONG' | 'SHORT'): OpenSafetyCard {
  return { originalSide: side, side, passes: {} };
}

export function safetyNoteSideChange(
  card: OpenSafetyCard,
  newSide: 'LONG' | 'SHORT'
): void {
  card.side = newSide;
  card.passes = {};
}

export function safetyMarkPass(
  card: OpenSafetyCard,
  gate: PreOrderSafetyGate,
  side: 'LONG' | 'SHORT'
): void {
  if (side !== card.side) return;
  card.passes[gate] = side;
}

export type PreOrderSafetyCheck = {
  ok: boolean;
  missingOrInvalid: PreOrderSafetyGate[];
  sideChanged: boolean;
  originalSide: 'LONG' | 'SHORT';
  side: 'LONG' | 'SHORT';
};

export function checkPreOrderSafetyInvariant(
  card: OpenSafetyCard,
  currentSide: 'LONG' | 'SHORT'
): PreOrderSafetyCheck {
  const missingOrInvalid: PreOrderSafetyGate[] = [];
  for (const gate of PRE_ORDER_SAFETY_GATES) {
    if (card.passes[gate] !== currentSide) missingOrInvalid.push(gate);
  }
  return {
    ok: missingOrInvalid.length === 0 && card.side === currentSide,
    missingOrInvalid,
    sideChanged: card.originalSide !== currentSide,
    originalSide: card.originalSide,
    side: currentSide,
  };
}

export function logPreOrderSafetyInvariantFailed(opts: {
  coin: string;
  check: PreOrderSafetyCheck;
}): void {
  logger.error('PRE_ORDER_SAFETY_INVARIANT_FAILED', {
    coin: opts.coin,
    side: opts.check.side,
    missingOrInvalidGates: opts.check.missingOrInvalid,
    sideChanged: opts.check.sideChanged,
    originalSide: opts.check.sideChanged ? opts.check.originalSide : undefined,
  });
}
