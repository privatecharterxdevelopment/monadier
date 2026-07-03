/** Sports betting fees accrue to hl_betting_fee_ledger (not bot platform fees). */
export const BETTING_ACCRUED_FEES_ENABLED = true;

/** Fee on winning cash-out notional — not charged on buys or losing exits. */
export const BETTING_WIN_FEE_LABEL = '2.5%';
export const BETTING_WINS_BEFORE_BLOCK = 1;

/** @deprecated Buy fee not used in win-only accrued model */
export const BETTING_BUY_FEE_LABEL = '0.5%';
export const BETTING_CASHOUT_FEE_LABEL = BETTING_WIN_FEE_LABEL;
