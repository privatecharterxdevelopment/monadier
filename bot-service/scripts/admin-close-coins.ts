import { hyperliquidTradingService } from '../src/services/hlTrading';

const coin = (process.argv[2] ?? 'BTC').toUpperCase();
const wallets = String(process.argv[3] ?? '')
  .split(',')
  .map((w) => w.trim().toLowerCase())
  .filter((w) => /^0x[a-f0-9]{40}$/.test(w));

if (wallets.length === 0) {
  console.error('wallets required');
  process.exit(1);
}

async function main() {
  const results: unknown[] = [];
  for (const w of wallets) {
    const r = await hyperliquidTradingService.closeMarketPosition(
      w as `0x${string}`,
      coin,
      'manual',
      undefined,
      'admin ops close'
    );
    results.push({ wallet: w, ...r });
  }
  console.log(JSON.stringify({ coin, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});