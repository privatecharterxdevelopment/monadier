import { analyzeMarketMTFBySymbol } from '../src/services/market';
import { config } from '../src/config';

async function main() {
  const coins = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT',
    'AVAXUSDT', 'LINKUSDT', 'WIFUSDT', 'HYPEUSDT',
  ];
  console.log('Gates:', {
    minConf: config.hyperliquid.minSignalConfidence,
    minTfs: config.hyperliquid.minDirectionalTfs,
    minAlign: config.hyperliquid.minTrendAlignment,
  });

  let pass = 0;
  for (const sym of coins) {
    try {
      const a = await analyzeMarketMTFBySymbol(sym, 'normal');
      if (!a) {
        console.log(sym, '→ null');
        continue;
      }
      const wouldPass =
        !a.isWeak &&
        a.confidence >= config.hyperliquid.minSignalConfidence &&
        (a.metrics?.directionalTfCount ?? 0) >= config.hyperliquid.minDirectionalTfs &&
        (a.metrics?.trendAlignment ?? 0) >= config.hyperliquid.minTrendAlignment;
      if (wouldPass) pass++;
      console.log(
        `${sym} ${a.direction} ${a.confidence}% weak=${a.isWeak} tfs=${a.metrics?.directionalTfCount} align=${a.metrics?.trendAlignment} h1=${a.metrics?.h1Trend} pass=${wouldPass}`
      );
    } catch (e) {
      console.log(sym, 'ERR', e);
    }
  }
  console.log(`\nWould pass global scan: ${pass}/${coins.length}`);
}

main().catch(console.error);
