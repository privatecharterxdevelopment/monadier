const DEFAULT_SYMBOLS = ['ETHUSDT', 'BTCUSDT', 'BNBUSDT', 'MATICUSDT', 'ARBUSDT'];

/** Vault / legacy position symbols → USD price (via Binance, server-side). */
export async function fetchMappedTokenPrices(
  symbols: string[] = DEFAULT_SYMBOLS
): Promise<Record<string, number>> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbols=${JSON.stringify(symbols)}`
    );
    if (!response.ok) return {};
    const data = (await response.json()) as Array<{ symbol: string; price: string }>;
    if (!Array.isArray(data)) return {};

    const bySymbol = new Map(data.map((row) => [row.symbol, parseFloat(row.price)]));
    const eth = bySymbol.get('ETHUSDT') ?? 0;
    const btc = bySymbol.get('BTCUSDT') ?? 0;
    const bnb = bySymbol.get('BNBUSDT') ?? 0;
    const matic = bySymbol.get('MATICUSDT') ?? 0;
    const arb = bySymbol.get('ARBUSDT') ?? 0;

    return {
      WETH: eth,
      ETH: eth,
      cbETH: eth,
      WBTC: btc,
      BTC: btc,
      BTCB: btc,
      WBNB: bnb,
      BNB: bnb,
      WMATIC: matic,
      MATIC: matic,
      ARB: arb,
    };
  } catch {
    return {};
  }
}
