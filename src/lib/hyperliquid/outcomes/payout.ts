export type OutcomePayoutPreview = {
  contracts: number;
  stakeUsd: number;
  price: number;
  payoutIfWin: number;
  profitIfWin: number;
  returnMultiple: number;
  impliedPct: number;
};

export function previewOutcomeBuy(opts: {
  stakeUsd?: number;
  contracts?: number;
  price: number;
}): OutcomePayoutPreview | null {
  const { price } = opts;
  if (!Number.isFinite(price) || price <= 0 || price >= 1) return null;

  let contracts = 0;
  let stakeUsd = 0;

  if (opts.contracts != null && Number.isFinite(opts.contracts) && opts.contracts > 0) {
    contracts = Math.floor(opts.contracts);
    stakeUsd = contracts * price;
  } else if (opts.stakeUsd != null && Number.isFinite(opts.stakeUsd) && opts.stakeUsd > 0) {
    stakeUsd = opts.stakeUsd;
    contracts = Math.floor(stakeUsd / price);
    if (contracts <= 0) return null;
    stakeUsd = contracts * price;
  } else {
    return null;
  }

  const payoutIfWin = contracts;
  const profitIfWin = payoutIfWin - stakeUsd;

  return {
    contracts,
    stakeUsd,
    price,
    payoutIfWin,
    profitIfWin,
    returnMultiple: stakeUsd > 0 ? payoutIfWin / stakeUsd : 0,
    impliedPct: price * 100,
  };
}

export function formatProfitUsd(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}
