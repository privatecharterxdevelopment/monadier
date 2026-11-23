import { aggregateHlCloseFills } from './hyperliquid/hlFillAggregate';
import { netHlClosePnl } from './hyperliquid/hlPnl';
import { toNum } from './hyperliquid/parse';
import {
  fetchHlAccountState,
  fetchHlNonFundingLedger,
  fetchHlSpotBalances,
  fetchHlUserFills,
  type HlNonFundingLedgerRow,
  type HlUserFill,
} from './hyperliquid/user';

const WALLET_RE = /^0x[a-f0-9]{40}$/i;
const DAY_MS = 86_400_000;

export type AdminHlWalletPnl = {
  wallet: string;
  /** Aggregated close count (one row per HL close, not per fill). */
  closedCount: number;
  winCount: number;
  lossCount: number;
  /** Net realized: Σ (closedPnl − trading fee) on aggregated closes. */
  closedNet: number;
  profitTotal: number;
  lossTotal: number;
  closedCount24h: number;
  wins24h: number;
  lossCount24h: number;
  closedNet24h: number;
  lossSum24h: number;
  equityUsd: number | null;
  netDepositsUsd: number | null;
  /** Perp + spot USDC − net deposits. Null if equity or deposits missing. */
  walletPnlUsd: number | null;
};

export function netHlLedgerUsdc(
  rows: HlNonFundingLedgerRow[],
  wallet: string
): number {
  const w = wallet.trim().toLowerCase();
  let net = 0;
  for (const row of rows) {
    const d = row.delta ?? {};
    const typ = String(d.type ?? '').toLowerCase();
    if (typ === 'deposit') {
      net += toNum(d.usdc);
      continue;
    }
    if (typ === 'withdraw') {
      net -= Math.abs(toNum(d.usdc));
      continue;
    }
    if (typ !== 'send') continue;
    const amt = toNum(d.usdcValue ?? d.amount);
    const fee = toNum(d.fee);
    const dest = String(d.destination ?? '').toLowerCase();
    const user = String(d.user ?? '').toLowerCase();
    if (dest === w) net += amt;
    else if (user === w) net -= amt + fee;
  }
  return net;
}

export function adminHlWalletPnlFromFills(
  wallet: string,
  fills: HlUserFill[],
  opts?: {
    nowMs?: number;
    equityUsd?: number | null;
    netDepositsUsd?: number | null;
  }
): AdminHlWalletPnl {
  const nowMs = opts?.nowMs ?? Date.now();
  const since24h = nowMs - DAY_MS;
  const closes = aggregateHlCloseFills(fills);

  let winCount = 0;
  let lossCount = 0;
  let closedNet = 0;
  let profitTotal = 0;
  let lossTotal = 0;
  let closedCount24h = 0;
  let wins24h = 0;
  let lossCount24h = 0;
  let closedNet24h = 0;
  let lossSum24h = 0;

  for (const row of closes) {
    const net = netHlClosePnl(row);
    closedNet += net;
    if (net > 0) {
      winCount += 1;
      profitTotal += net;
    } else if (net < 0) {
      lossCount += 1;
      lossTotal += net;
    }
    if (toNum(row.time) >= since24h) {
      closedCount24h += 1;
      closedNet24h += net;
      if (net > 0) wins24h += 1;
      else if (net < 0) {
        lossCount24h += 1;
        lossSum24h += net;
      }
    }
  }

  const equityUsd =
    opts?.equityUsd != null && Number.isFinite(opts.equityUsd) ? opts.equityUsd : null;
  const netDepositsUsd =
    opts?.netDepositsUsd != null && Number.isFinite(opts.netDepositsUsd)
      ? opts.netDepositsUsd
      : null;
  const walletPnlUsd =
    equityUsd != null && netDepositsUsd != null ? equityUsd - netDepositsUsd : null;

  return {
    wallet: wallet.trim().toLowerCase(),
    closedCount: closes.length,
    winCount,
    lossCount,
    closedNet,
    profitTotal,
    lossTotal,
    closedCount24h,
    wins24h,
    lossCount24h,
    closedNet24h,
    lossSum24h,
    equityUsd,
    netDepositsUsd,
    walletPnlUsd,
  };
}

async function fetchOneWalletPnl(wallet: string): Promise<AdminHlWalletPnl | null> {
  const w = wallet.trim().toLowerCase();
  if (!WALLET_RE.test(w)) return null;
  try {
    const [fills, account, spot, ledger] = await Promise.all([
      fetchHlUserFills(w, 2000),
      fetchHlAccountState(w),
      fetchHlSpotBalances(w),
      fetchHlNonFundingLedger(w, { startTime: Date.now() - 400 * DAY_MS }),
    ]);
    const spotUsdc = spot
      .filter((b) => String(b.coin ?? '').toUpperCase().startsWith('USDC'))
      .reduce((s, b) => s + toNum(b.total), 0);
    const equityUsd = toNum(account.margin.accountValue) + spotUsdc;
    return adminHlWalletPnlFromFills(w, fills, {
      equityUsd,
      netDepositsUsd: netHlLedgerUsdc(ledger, w),
    });
  } catch (err) {
    console.warn(
      '[adminHlWalletPnl] HL overlay failed',
      w.slice(0, 12),
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export async function fetchAdminHlWalletPnlMap(
  wallets: string[]
): Promise<Map<string, AdminHlWalletPnl>> {
  const unique = [
    ...new Set(wallets.map((w) => w.trim().toLowerCase()).filter((w) => WALLET_RE.test(w))),
  ];
  const out = new Map<string, AdminHlWalletPnl>();
  if (unique.length === 0) return out;
  const rows = await Promise.all(unique.map((w) => fetchOneWalletPnl(w)));
  for (const row of rows) {
    if (row) out.set(row.wallet, row);
  }
  return out;
}
