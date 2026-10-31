/** Sports betting fees accrue to hl_betting_fee_ledger (not bot platform fees). */
export const BETTING_ACCRUED_FEES_ENABLED = true;

/** Accrued on every bet place — 0.5% of buy notional. */
export const BETTING_BUY_FEE_LABEL = '0.5%';
/** Accrued on profitable cash-out — 2.5% of sell notional. */
export const BETTING_WIN_FEE_LABEL = '2.5%';
export const BETTING_WINS_BEFORE_BLOCK = 1;

export const BETTING_CASHOUT_FEE_LABEL = BETTING_WIN_FEE_LABEL;
