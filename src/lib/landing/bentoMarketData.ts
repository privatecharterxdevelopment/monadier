export type BentoMarketId = 'btc' | 'eth' | 'arb';

export type BentoMarketConfig = {
  id: BentoMarketId;
  symbol: string;
  pairLabel: string;
  name: string;
};

export const BENTO_MARKETS: BentoMarketConfig[] = [
  { id: 'btc', symbol: 'BTCUSDT', pairLabel: 'BTC/USD', name: 'Bitcoin' },
  { id: 'eth', symbol: 'ETHUSDT', pairLabel: 'ETH/USD', name: 'Ethereum' },
  { id: 'arb', symbol: 'ARBUSDT', pairLabel: 'ARB/USD', name: 'Arbitrum' },
];

export type BentoMarketQuote = {
  id: BentoMarketId;
  symbol: string;
  pairLabel: string;
  name: string;
  price: number;
  openPrice24h: number;
  change24hPct: number;
  volumeChangePct: number;
  sparkline: number[];
};

type Binance24hr = {
  symbol: string;
  lastPrice: string;
  openPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

function toNum(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function volumeChangeFromKlines(rows: unknown[][]): number {
  if (rows.length < 48) return 0;
  const sumVol = (slice: unknown[][]) =>
    slice.reduce((acc, row) => acc + toNum(row[7]), 0);
  const prev = sumVol(rows.slice(0, 24));
  const curr = sumVol(rows.slice(24));
  if (prev <= 0) return 0;
  return ((curr - prev) / prev) * 100;
}

async function fetchKlines(symbol: string): Promise<{ closes: number[]; volumeChangePct: number }> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=48`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`klines ${symbol}`);
  const rows = (await res.json()) as unknown[][];
  const closes = rows.slice(-24).map((row) => toNum(row[4]));
  return { closes, volumeChangePct: volumeChangeFromKlines(rows) };
}

async function fetchTicker24hr(symbols: string[]): Promise<Map<string, Binance24hr>> {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('ticker24hr');
  const rows = (await res.json()) as Binance24hr[];
  return new Map(rows.map((row) => [row.symbol, row]));
}

export async function fetchBentoMarketQuotes(): Promise<BentoMarketQuote[]> {
  const symbols = BENTO_MARKETS.map((m) => m.symbol);
  const [tickers, ...klines] = await Promise.all([
    fetchTicker24hr(symbols),
    ...BENTO_MARKETS.map((m) => fetchKlines(m.symbol)),
  ]);

  return BENTO_MARKETS.map((market, i) => {
    const ticker = tickers.get(market.symbol);
    const kline = klines[i] as { closes: number[]; volumeChangePct: number };
    const price = toNum(ticker?.lastPrice);
    const openPrice24h = toNum(ticker?.openPrice);
    const change24hPct = toNum(ticker?.priceChangePercent);
    const sparkline =
      kline.closes.length > 0
        ? kline.closes
        : openPrice24h > 0
          ? [openPrice24h, price]
          : [price, price];

    return {
      id: market.id,
      symbol: market.symbol,
      pairLabel: market.pairLabel,
      name: market.name,
      price,
      openPrice24h,
      change24hPct,
      volumeChangePct: kline.volumeChangePct,
      sparkline,
    };
  });
}

export function formatMarketPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1000) {
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (value >= 1) {
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 3,
    maximumFractionDigits: 4,
  });
}

export function formatPctChange(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** Build SVG sparkline path + baseline Y (0–1 viewBox height). */
export function buildSparklinePaths(
  points: number[],
  openPrice: number,
  width = 100,
  height = 44
): { line: string; baselineY: number } | null {
  if (points.length < 2) return null;

  const min = Math.min(...points, openPrice);
  const max = Math.max(...points, openPrice);
  const span = max - min || 1;
  const pad = span * 0.08;
  const lo = min - pad;
  const hi = max + pad;
  const range = hi - lo;

  const toX = (i: number) => (i / (points.length - 1)) * width;
  const toY = (v: number) => height - ((v - lo) / range) * height;

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(2)} ${toY(p).toFixed(2)}`)
    .join(' ');

  return { line, baselineY: toY(openPrice) };
}
