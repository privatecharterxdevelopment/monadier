/** User-facing copy for betting order rail errors. */
export function formatBettingOrderError(raw: string): string {
  if (/failed to sign typed data|sign typed data/i.test(raw)) {
    return 'Wallet signature failed — confirm in your wallet app, or reconnect and try again.';
  }
  if (/user rejected|rejected the request|denied/i.test(raw)) {
    return 'Signature cancelled in wallet.';
  }
  if (/Must deposit before performing actions/i.test(raw)) {
    return 'Deposit USDC to Hyperliquid Spot before betting (min $10).';
  }
  if (/insufficient|not enough/i.test(raw)) {
    return 'Not enough USDC on Hyperliquid Spot for this bet.';
  }
  return raw;
}
