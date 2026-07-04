import type { UnifiedSignal } from './signalService';
import { MIN_HL_BOT_USD } from './hyperliquid/hlBotAgent';
import { isInternalPlatformOpsMessage } from './hyperliquid/builderPlatform';
import { isBotScanNoiseDetail } from './hlBotReasonLabels';
import {
  HL_BOT_CYCLE_SEC,
  HL_MAX_CONCURRENT_POSITIONS,
  HL_MIN_SIGNAL_CONFIDENCE,
} from './hlBotConstants';

export type BotReadiness = {
  canEnter: boolean;
  headline: string;
  detail: string;
};

function formatBlocker(blocker: string): string {
  if (isInternalPlatformOpsMessage(blocker)) return '';
  if (isBotScanNoiseDetail(blocker)) return '';
  if (/Neutral — \d+ LONG.*SHORT/i.test(blocker)) return '';
  if (/trend-only/i.test(blocker)) return '';
  if (/No aligned setup in global scan/i.test(blocker)) return '';
  if (/user\.3\.9_no_signals|market\.no_setup/i.test(blocker)) return '';
  if (/BTC 24h \$|ETH 24h \$|weekendMajorsOnly|Scan BTC .* · ETH/i.test(blocker)) return '';
  if (/Funding\/24h range blocks chasing|LONG blocked — .*24h range/i.test(blocker)) {
    return 'Last open skipped — price extended on 24h range; bot keeps scanning';
  }
  if (/HL agent not approved|Trading agent not approved/i.test(blocker)) {
    return 'Approve the trading agent in the Bot panel';
  }
  if (/Hyperliquid temporarily unreachable/i.test(blocker)) {
    return 'Checking trading agent — try again in a moment.';
  }
  if (/HL balance check failed|Could not read Hyperliquid balance|Checking your Hyperliquid balance/i.test(blocker)) {
    return '';
  }
  if (/HL balance/i.test(blocker)) {
    return blocker.replace(/HL balance/i, 'HL balance');
  }
  if (/builder fee|platform fee/i.test(blocker)) {
    return 'Approve the Hyperliquid platform fee in the Bot panel';
  }
  if (/Cautious alt.*confidence.*below/i.test(blocker)) {
    const m = blocker.match(/Cautious alt (\w+): confidence (\d+)% below (\d+)%/i);
    if (m) {
      return `${m[1]} needs ${m[3]}%+ confidence (small-cap alt) — had ${m[2]}%, trying next pair`;
    }
    return 'Small-cap alt needs higher confidence — bot tries next pair';
  }
  if (/top-pairs fallback|relaxed scan/i.test(blocker)) {
    return 'Scanning top HL pairs with slightly relaxed rules';
  }
  if (/no HL perp passed global scan/i.test(blocker)) {
    const m = blocker.match(/min (\d+)% conf, (\d+) TFs, (\d+)% align/i);
    if (m) {
      return `No HL pair meets entry rules yet (${m[1]}%+ confidence, ${m[2]}/3 timeframes aligned, ${m[3]}% trend)`;
    }
    return 'No HL pair passed the global scan yet — bot keeps checking all perps';
  }
  if (/Pre-trade gate blocked|volume\/liquidity|volume\/sweep/i.test(blocker)) {
    return 'Volume gate blocked entry — bot retries next cycle';
  }
  if (/Mega pair OUTFLOW blocks LONG/i.test(blocker)) {
    return 'BTC+ETH outflow blocks alt LONGs — majors (BTC/ETH) still allowed';
  }
  if (/Last open:.*outflow blocks new LONGs/i.test(blocker)) {
    return 'BTC+ETH outflow blocked alt LONG — trying majors or next cycle';
  }
  if (/notional.*below min/i.test(blocker)) {
    return blocker.replace(
      /raise risk % or leverage/i,
      'raise Risk % or LVRG in bot settings, or deposit more USDC'
    );
  }
  if (/no trade signal|MTF|bot conf/i.test(blocker)) {
    return 'No strong trade setup yet — bot keeps scanning';
  }
  if (/short-window|SHORT only|Fri \d{1,2}:00 MES/i.test(blocker)) {
    return '';
  }
  if (/HL max positions/i.test(blocker)) {
    return blocker.replace(/HL max positions/i, 'All bot slots in use');
  }
  if (/HL position open/i.test(blocker)) {
    return `Open position: ${blocker.replace(/HL position open:\s*/i, '')}`;
  }
  if (/HL order failed/i.test(blocker)) {
    return blocker.replace(/^HL order failed(?: \([^)]+\))?:\s*/i, 'Last open: ');
  }
  if (/Last open attempt/i.test(blocker)) {
    return blocker.replace(/^Last open attempt \([^)]+\):\s*/i, 'Last open: ');
  }
  if (/Last open:.*Cautious alt/i.test(blocker)) {
    const m = blocker.match(/Last open: Cautious alt (\w+): confidence (\d+)% below (\d+)%/i);
    if (m) {
      return `Last try ${m[1]}: ${m[2]}% — small-cap alts need ${m[3]}%+`;
    }
  }
  if (/notional below floor|Trade size too small|notional.*below min/i.test(blocker)) {
    const detail = blocker.match(
      /need ~\$([\d.]+) margin at your (\d+)x, ~\$([\d.]+) at 5x, ~\$([\d.]+) at 20x/i
    );
    if (detail) {
      const margin = blocker.match(/margin \$([\d.]+)/i)?.[1];
      return (
        `HL $20 min — you have $${margin ?? '?'} margin: need ~$${detail[1]} at your ${detail[2]}x, ` +
        `or only ~$${detail[3]} at 5x / ~$${detail[4]} at 20x. Raise LVRG or Risk %.`
      );
    }
    return 'Trade size below $20 min — raise LVRG or Risk % in bot settings';
  }
  if (/Must deposit before performing actions/i.test(blocker)) {
    return 'Deposit USDC on Hyperliquid first (min $20)';
  }
  if (/margin too small|free margin too low/i.test(blocker)) {
    const m = blocker.match(/\$([\d.]+).*balance \$([\d.]+)/i);
    if (m) {
      return `Waiting for margin — ~$${m[1]} usable from $${m[2]} on HL (lower Risk % in LVRG or deposit more for a 2nd trade)`;
    }
    return 'Not enough free margin for another trade — lower Risk % in LVRG or deposit more USDC';
  }
  if (/HL balance \$([\d.]+).*min \$([\d.]+)/i.test(blocker)) {
    const m = blocker.match(/HL balance \$([\d.]+).*min \$([\d.]+)/i);
    if (m) {
      return `HL balance $${m[1]} — need $${m[2]}+ on Hyperliquid to trade`;
    }
  }
  if (/Perp margin \$|HL perp balance|HL account equity/i.test(blocker)) {
    return '';
  }
  return blocker;
}

/** User-facing blocker text — strips internal MTF / scan engine noise. */
export function formatUserBlocker(blocker: string): string {
  return formatBlocker(blocker);
}

export function readinessFromServerBlockers(blockers: string[]): BotReadiness {
  const formatted = blockers.map((b) => formatBlocker(b)).filter(Boolean);
  const unique = [...new Set(formatted)];
  const hasAgentBlocker = unique.some((b) => /trading agent/i.test(b));
  const detail = (
    hasAgentBlocker
      ? unique.filter(
          (b) =>
            !/Checking your Hyperliquid balance|HL balance check failed|retrying/i.test(b)
        )
      : unique
  ).join(' · ');
  return {
    canEnter: false,
    headline: detail ? 'Bot waiting' : 'Bot is reading market…',
    detail,
  };
}

export type BotScanSetup = {
  coin: string;
  direction: string;
  confidence: number;
  reason?: string;
};

function setupLabel(setup: BotScanSetup | null | undefined): string | null {
  if (!setup?.coin || !setup.direction || setup.direction === 'HOLD') return null;
  const conf = Math.round(setup.confidence);
  const reason = setup.reason?.trim();
  if (reason && !isBotScanNoiseDetail(reason)) {
    return `${setup.coin} ${setup.direction} ${conf}% — ${reason}`;
  }
  return `${setup.coin} ${setup.direction} ${conf}%`;
}

export function evaluateBotReadiness(
  signal: UnifiedSignal | null,
  opts: {
    autoTradeEnabled: boolean;
    openPositionsCount: number;
    maxConcurrentPositions?: number;
    vaultUsd: number;
    minVaultUsd?: number;
    /** Global scan target for the next free slot (independent pair). */
    nextSetup?: BotScanSetup | null;
    /** @deprecated use openPositionsCount */
    hasOpenPosition?: boolean;
  }
): BotReadiness {
  const minCapital = opts.minVaultUsd ?? MIN_HL_BOT_USD;
  const maxSlots = opts.maxConcurrentPositions ?? HL_MAX_CONCURRENT_POSITIONS;
  const openCount =
    opts.openPositionsCount ??
    (opts.hasOpenPosition ? maxSlots : 0);

  if (!opts.autoTradeEnabled) {
    return {
      canEnter: false,
      headline: 'Bot off',
      detail: 'Complete deposit and agent approval, then press Start bot.',
    };
  }

  if (openCount >= maxSlots) {
    return {
      canEnter: false,
      headline: `${openCount}/${maxSlots} slots full`,
      detail: 'The bot is managing all active trades.',
    };
  }

  if (opts.vaultUsd < minCapital) {
    return {
      canEnter: false,
      headline: 'Deposit needed',
      detail: `At least $${minCapital} USDC on Hyperliquid to trade.`,
    };
  }

  if (!signal && !opts.nextSetup) {
    return {
      canEnter: false,
      headline: openCount > 0 ? `Slot ${openCount + 1} scan` : 'Bot active',
      detail:
        openCount > 0
          ? 'Scanning all HL perps for an independent 2nd trade…'
          : 'Loading market data…',
    };
  }

  const next = opts.nextSetup;
  const nextConf = next ? Math.round(next.confidence) : 0;
  const conf = Math.round(signal?.confidence ?? nextConf);
  const direction = signal?.direction ?? next?.direction ?? 'HOLD';
  const label = setupLabel(next) ?? (direction !== 'HOLD' ? `${direction} ${conf}%` : null);
  const minConf = HL_MIN_SIGNAL_CONFIDENCE;
  const strong = conf >= minConf && direction !== 'HOLD';
  const slotLabel =
    openCount > 0
      ? `slot ${openCount + 1}/${maxSlots}`
      : `up to ${maxSlots} trades`;
  const cycleHint =
    HL_BOT_CYCLE_SEC <= 1 ? 'next cycle (~1s)' : `next cycle (~${HL_BOT_CYCLE_SEC}s)`;

  if (strong && label) {
    return {
      canEnter: true,
      headline: openCount > 0 ? `Slot ${openCount + 1}: ${next?.coin ?? 'signal'}` : 'Opening trade',
      detail:
        openCount > 0
          ? `${label} — independent pair, ${cycleHint}`
          : `${label} — bot tries to open on ${cycleHint}`,
    };
  }

  const tfSummary =
    signal?.timeframes?.length &&
    signal.timeframes
      .map((tf) => `${tf.timeframe} ${tf.direction} ${Math.round(tf.confidence)}%`)
      .join(' · ');

  return {
    canEnter: false,
    headline: openCount > 0 ? `Slot ${openCount + 1} scan` : 'Scanning markets',
    detail:
      label && conf > 0 && conf < minConf
        ? `${label} below ${minConf}% threshold — still scanning all HL perps`
        : tfSummary
          ? `MTF on chart pair: ${tfSummary}`
          : openCount > 0
            ? label
              ? `Analyzing ${label} across HL perps (not your open pair)…`
              : `Scanning ${slotLabel} across all HL perps…`
            : label
              ? `${label} — waiting for ${minConf}%+ alignment`
              : 'Waiting for a strong trade setup on Hyperliquid.',
  };
}
