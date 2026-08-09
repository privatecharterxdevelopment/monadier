import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderWinFlyerPng } from '../src/services/tradeShareFlyer';

async function main() {
  const png = await renderWinFlyerPng({
    displayName: 'lorelli33',
    avatarUrl: null,
    coin: 'BTC',
    side: 'LONG',
    closedPnlUsd: 31762.55,
    closePrice: 65200,
    entryPrice: 64100,
    size: 4.85,
    closedAtMs: Date.now(),
    referralCode: 'LORELLI33',
    venueLabel: 'Hyperliquid Perp',
    leverage: 40,
    referralUrl: 'https://app.hypergain.io/?ref=LORELLI33',
  });
  const dir = resolve(process.cwd(), 'tmp');
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, 'win-flyer-lorelli33-fixed.png');
  writeFileSync(path, png);
  console.log('wrote', path, png.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
