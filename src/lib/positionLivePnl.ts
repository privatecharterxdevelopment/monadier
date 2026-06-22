import { getBotApiBase } from './signalService';

export type PositionPnlRow = {
  status: string;
  entry_price: number;
  entry_amount: number;
  token_symbol: string;
  direction: string;
  highest_price?: number | null;
  profit_loss: number | null;
  leverage_multiplier: number | null;
};

/** Live spot prices for vault PnL — proxied via bot-service (Binance blocks browser CORS). */
export async function fetchLiveTokenPrices(): Promise<Record<string, number>> {
  try {
    const response = await fetch(`${getBotApiBase()}/api/token-prices`);
    if (!response.ok) return {};
    const data = (await response.json()) as { success?: boolean; prices?: Record<string, number> };
    return data.success && data.prices ? data.prices : {};
  } catch {
    return {};
  }
}

export function calcPositionPnl(
  position: PositionPnlRow,
  livePrices: Record<string, number>
): number {
  if (position.status === 'closed' || position.status === 'failed') {
    return position.profit_loss ?? 0;
  }
  if (!position.entry_price || position.entry_price <= 0 || !position.entry_amount) {
    return 0;
  }

  const tokenSymbol = position.token_symbol || 'WETH';
  const currentPrice =
    livePrices[tokenSymbol] || position.highest_price || position.entry_price;
  if (!currentPrice || currentPrice <= 0) return 0;

  const priceChange =
    position.direction === 'SHORT'
      ? position.entry_price - currentPrice
      : currentPrice - position.entry_price;
  const leverage = position.leverage_multiplier || 1;
  const profitPercent = (priceChange / position.entry_price) * leverage * 100;
  const positionPL = (position.entry_amount * profitPercent) / 100;
  return Number.isFinite(positionPL) ? positionPL : 0;
}

export type PositionStats = {
  totalProfit: number;
  realizedProfit: number;
  unrealizedProfit: number;
  winRate: number;
  closedTrades: number;
  openPositions: number;
};

export function computePositionStats(
  all: PositionPnlRow[],
  livePrices: Record<string, number>
): PositionStats {
  const closed = all.filter((p) => p.status === 'closed');
  const failed = all.filter((p) => p.status === 'failed');
  const open = all.filter((p) => p.status === 'open' || p.status === 'closing');

  const realizedProfit = closed.reduce((s, p) => s + (p.profit_loss || 0), 0);
  const unrealizedProfit = open.reduce(
    (s, p) => s + calcPositionPnl(p, livePrices),
    0
  );
  const closedWins = closed.filter((p) => (p.profit_loss || 0) > 0).length;
  const winRate =
    closed.length > 0 ? (closedWins / closed.length) * 100 : 0;

  return {
    totalProfit: realizedProfit + unrealizedProfit,
    realizedProfit,
    unrealizedProfit,
    winRate,
    closedTrades: closed.length + failed.length,
    openPositions: open.length,
  };
}
