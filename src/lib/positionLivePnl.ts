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

export async function fetchLiveTokenPrices(): Promise<Record<string, number>> {
  try {
    const symbols = ['ETHUSDT', 'BTCUSDT', 'BNBUSDT', 'MATICUSDT', 'ARBUSDT'];
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbols=${JSON.stringify(symbols)}`
    );
    const data = await response.json();
    if (!Array.isArray(data)) return {};

    const ethPrice = data.find((t: { symbol: string }) => t.symbol === 'ETHUSDT')?.price;
    const btcPrice = data.find((t: { symbol: string }) => t.symbol === 'BTCUSDT')?.price;
    const bnbPrice = data.find((t: { symbol: string }) => t.symbol === 'BNBUSDT')?.price;
    const maticPrice = data.find((t: { symbol: string }) => t.symbol === 'MATICUSDT')?.price;
    const arbPrice = data.find((t: { symbol: string }) => t.symbol === 'ARBUSDT')?.price;

    return {
      WETH: ethPrice ? parseFloat(ethPrice) : 0,
      ETH: ethPrice ? parseFloat(ethPrice) : 0,
      cbETH: ethPrice ? parseFloat(ethPrice) : 0,
      WBTC: btcPrice ? parseFloat(btcPrice) : 0,
      BTC: btcPrice ? parseFloat(btcPrice) : 0,
      BTCB: btcPrice ? parseFloat(btcPrice) : 0,
      WBNB: bnbPrice ? parseFloat(bnbPrice) : 0,
      BNB: bnbPrice ? parseFloat(bnbPrice) : 0,
      WMATIC: maticPrice ? parseFloat(maticPrice) : 0,
      MATIC: maticPrice ? parseFloat(maticPrice) : 0,
      ARB: arbPrice ? parseFloat(arbPrice) : 0,
    };
  } catch (err) {
    console.error('[positionLivePnl] prices', err);
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
