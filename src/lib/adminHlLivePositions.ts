import { hlInfoPost } from './hyperliquid/hlInfoClient';
import { fetchHlAccountState, type HlPosition } from './hyperliquid/user';
import type { AdminHlBot, AdminHlDashboard, AdminOpenPosition, AdminUserRow } from './adminDashboard';

const WALLET_RE = /^0x[a-f0-9]{40}$/i;

/** Same uPnL math as ProTradeDock — mark-based when mids available. */
export function adminLivePositionPnl(
  szi: number,
  entryPx: number,
  markPx: number,
  hlUpnl: number
): number {
  if (markPx > 0 && entryPx > 0 && szi !== 0) {
    return szi > 0 ? (markPx - entryPx) * szi : (entryPx - markPx) * Math.abs(szi);
  }
  return hlUpnl;
}

function marginRoePct(upnlUsd: number, notionalUsd: number, leverage: number): number | null {
  const lev = Math.max(1, leverage);
  if (notionalUsd <= 0) return null;
  const collateral = notionalUsd / lev;
  if (collateral <= 0) return null;
  return (upnlUsd / collateral) * 100;
}

export function collectAdminHlWalletAddresses(dash: AdminHlDashboard): string[] {
  const set = new Set<string>();
  const add = (addr: string | null | undefined) => {
    const w = addr?.trim().toLowerCase();
    if (w && WALLET_RE.test(w)) set.add(w);
  };

  for (const u of dash.users) add(u.wallet_address);
  for (const b of dash.active_bots) add(b.wallet_address);
  for (const t of dash.recent_closes) add(t.wallet_address);
  for (const e of dash.recent_events) add(e.wallet_address);
  for (const f of dash.fee_ledger) add(f.wallet_address);

  return [...set];
}

function emailForWallet(
  wallet: string,
  users: AdminUserRow[],
  bots: AdminHlBot[]
): string | null {
  const w = wallet.toLowerCase();
  const user = users.find((u) => u.wallet_address?.toLowerCase() === w);
  if (user?.email) return user.email;
  const bot = bots.find((b) => b.wallet_address === w);
  return bot?.email ?? null;
}

export async function fetchHlAllMidsMap(): Promise<Record<string, number>> {
  const raw = await hlInfoPost<Record<string, string>>({ type: 'allMids' });
  const out: Record<string, number> = {};
  for (const [coin, px] of Object.entries(raw ?? {})) {
    const n = Number(px);
    if (Number.isFinite(n) && n > 0) out[coin.toUpperCase()] = n;
  }
  return out;
}

function mapHlPosition(
  wallet: string,
  p: HlPosition,
  marks: Record<string, number>,
  email: string | null
): AdminOpenPosition | null {
  const szi = Number.parseFloat(p.szi);
  if (!Number.isFinite(szi) || Math.abs(szi) < 1e-12) return null;

  const entryPx = Number.parseFloat(p.entryPx);
  const notional = Number.parseFloat(p.positionValue);
  const hlUpnl = Number.parseFloat(p.unrealizedPnl);
  const lev = Math.max(1, p.leverage?.value ?? 1);
  const coin = p.coin.toUpperCase();
  const markPx = marks[coin] ?? 0;
  const upnl = adminLivePositionPnl(szi, entryPx, markPx, hlUpnl);

  return {
    id: `${wallet}:${coin}`,
    wallet_address: wallet,
    email,
    token_symbol: coin,
    direction: szi >= 0 ? 'LONG' : 'SHORT',
    status: 'open',
    size: szi,
    abs_size: Math.abs(szi),
    notional_usd: Number.isFinite(notional) ? notional : null,
    entry_amount: Number.isFinite(notional) ? notional : 0,
    entry_price: Number.isFinite(entryPx) ? entryPx : null,
    mark_price: markPx > 0 ? markPx : null,
    profit_loss: upnl,
    profit_loss_percent: marginRoePct(upnl, notional, lev),
    leverage_multiplier: lev,
    created_at: new Date().toISOString(),
  };
}

async function fetchWalletPositions(
  wallet: string,
  marks: Record<string, number>,
  email: string | null
): Promise<AdminOpenPosition[]> {
  const state = await fetchHlAccountState(wallet);
  const out: AdminOpenPosition[] = [];
  for (const p of state.positions) {
    const row = mapHlPosition(wallet, p, marks, email);
    if (row) out.push(row);
  }
  return out;
}

/** Fetch every HL perp open across all known user wallets — matches Pro Trade dock. */
export async function fetchAdminHlLiveOpenPositions(
  dash: AdminHlDashboard
): Promise<AdminOpenPosition[]> {
  const wallets = collectAdminHlWalletAddresses(dash);
  if (wallets.length === 0) return [];

  const marks = await fetchHlAllMidsMap();
  const out: AdminOpenPosition[] = [];
  const chunkSize = 6;

  for (let i = 0; i < wallets.length; i += chunkSize) {
    const chunk = wallets.slice(i, i + chunkSize);
    const rows = await Promise.all(
      chunk.map(async (wallet) => {
        try {
          const email = emailForWallet(wallet, dash.users, dash.active_bots);
          return await fetchWalletPositions(wallet, marks, email);
        } catch (err) {
          console.warn('[adminHlLivePositions] wallet fetch failed', wallet.slice(0, 10), err);
          return [] as AdminOpenPosition[];
        }
      })
    );
    for (const list of rows) out.push(...list);
  }

  return out.sort((a, b) => (a.profit_loss ?? 0) - (b.profit_loss ?? 0));
}

export function sumAdminOpenUpnl(rows: AdminOpenPosition[]): number {
  return rows.reduce((s, p) => s + (p.profit_loss ?? 0), 0);
}
