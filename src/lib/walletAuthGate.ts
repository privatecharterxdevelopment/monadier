/**
 * Sync auth gate for wallet connect — updated by AuthProvider.
 * Wallet connect / reconnect must not run without HyperGain login (or demo).
 */

let authReady = false;
let authAllowed = false;

export function setWalletAuthGate(opts: { ready: boolean; allowed: boolean }): void {
  authReady = opts.ready;
  authAllowed = opts.allowed;
}

export function isWalletAuthAllowed(): boolean {
  return authReady && authAllowed;
}

export function isWalletAuthGateReady(): boolean {
  return authReady;
}

export const REQUIRE_SIGN_IN_EVENT = 'monadier:require-sign-in';

export function emitRequireSignIn(reason: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(REQUIRE_SIGN_IN_EVENT, { detail: { reason } })
  );
}
