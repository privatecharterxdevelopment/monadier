/**
 * One-off ops: force-open with HL_ALLOW_LONG_OPENS for admin desk.
 */
import { buildTradingCycleContext } from '../src/services/tradingCycleContext';
import { hyperliquidTradingService } from '../src/services/hlTrading';

const coin = (process.argv[2] ?? 'BTC').toUpperCase();
const direction =
  String(process.argv[3] ?? 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
const leverage = Number(process.argv[4] ?? 20);
const wallets = String(process.argv[5] ?? '')
  .split(',')
  .map((w) => w.trim().toLowerCase())
  .filter((w) => /^0x[a-f0-9]{40}$/.test(w));

if (wallets.length === 0) {
  console.error('wallets required (comma-separated)');
  process.exit(1);
}

async function main() {
  const ctx = await buildTradingCycleContext();
  const result = await hyperliquidTradingService.forceOpenForAutoTradeUsers({
    coin,
    direction,
    ctx,
    wallets,
    leverage: Number.isFinite(leverage) && leverage > 0 ? Math.floor(leverage) : 20,
    dryRun: false,
  });
  console.log(JSON.stringify({ coin, direction, leverage, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});