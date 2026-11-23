/**
 * Local dry-run for Gemini Vision trade confirm — prints schema-A payload + live outputs.
 * Usage: GEMINI_API_KEY=... npx tsx scripts/llm-trade-confirm-smoke.ts
 */
import {
  buildGeminiRequestPayload,
  confirmTradeWithLlm,
  parseLlmJson,
  type LlmTradeConfirmInput,
} from '../src/services/llmTradeConfirmGate';

process.env.HL_LLM_GATE_ENABLED = process.env.HL_LLM_GATE_ENABLED || 'true';
process.env.HL_LLM_GATE_MODE = process.env.HL_LLM_GATE_MODE || 'shadow';

const scenarios: Array<{ name: string; input: LlmTradeConfirmInput }> = [
  {
    name: 'HYPE peak LONG + oversized rejection candle',
    input: {
      coin: 'HYPE',
      direction: 'LONG',
      confidence: 100,
      directionalTfCount: 2,
      trendAlignment: 100,
      h1Trend: 'UP',
      mtfBreakdown: '15m LONG 100% | 1h LONG 100%',
      profileName: 'bull_market',
      primaryDirection: 'LONG',
      pumpPhase: 'at_apex',
      pumpApex: 61.55,
      positionInSweep: 0.98,
      pumpSummary: 'apex $61.55 (0h ago) · at apex',
      htfSrReason: 'LONG near HTF resistance 61.40 (4h, 8× rejected)',
      candleSummary:
        '15m: quiet 10 bars then 1 oversized green (+1.8% vs avg 0.2%), next bar red rejection wick; rangePos 0.95',
      netMovePct: 1.2,
      rangePosition: 0.95,
    },
  },
  {
    name: 'BTC apex LONG exhaustion spike',
    input: {
      coin: 'BTC',
      direction: 'LONG',
      confidence: 93,
      directionalTfCount: 2,
      trendAlignment: 100,
      h1Trend: 'UP',
      mtfBreakdown: '15m LONG 90% | 1h LONG 100%',
      profileName: 'bull_market',
      primaryDirection: 'LONG',
      pumpPhase: 'at_apex',
      pumpApex: 65100,
      positionInSweep: 0.96,
      pumpSummary: 'apex $65100 · at apex',
      htfSrReason: null,
      candleSummary:
        '15m last 12: small bodies, then one 3× average range spike into high — classic exhaustion risk',
      netMovePct: 0.4,
      rangePosition: 0.88,
    },
  },
  {
    name: 'ETH turnaround LONG steady candles',
    input: {
      coin: 'ETH',
      direction: 'LONG',
      confidence: 78,
      directionalTfCount: 2,
      trendAlignment: 75,
      h1Trend: 'SIDEWAYS',
      mtfBreakdown: '15m LONG 70% | 1h LONG 80%',
      profileName: 'bull_market',
      primaryDirection: 'LONG',
      pumpPhase: 'near_turnaround',
      pumpApex: 1892,
      positionInSweep: 0.22,
      pumpSummary: 'near turnaround ~$1861',
      htfSrReason: null,
      candleSummary:
        '15m: 8 similar-sized green candles after sweep (avg range ~equal) — durable trend tendency',
      netMovePct: 0.15,
      rangePosition: 0.35,
    },
  },
  {
    name: 'SOL SHORT at apex even candles',
    input: {
      coin: 'SOL',
      direction: 'SHORT',
      confidence: 82,
      directionalTfCount: 2,
      trendAlignment: 100,
      h1Trend: 'DOWN',
      mtfBreakdown: '5m SHORT 85% | 1m SHORT 80%',
      profileName: 'bear_market',
      primaryDirection: 'SHORT',
      pumpPhase: 'at_apex',
      pumpApex: 78.2,
      positionInSweep: 0.94,
      pumpSummary: 'at apex — SHORT liquidity grab',
      htfSrReason: null,
      candleSummary:
        '5m: series of even red candles off apex (relative size ~last 10 avg) — trend continuation',
      netMovePct: -0.2,
      rangePosition: 0.9,
    },
  },
  {
    name: 'SUI LONG into resistance + spike bar',
    input: {
      coin: 'SUI',
      direction: 'LONG',
      confidence: 88,
      directionalTfCount: 3,
      trendAlignment: 80,
      h1Trend: 'UP',
      mtfBreakdown: '5m LONG | 15m LONG | 1h LONG',
      profileName: 'bull_market',
      primaryDirection: 'LONG',
      pumpPhase: 'neutral',
      pumpApex: 0.76,
      positionInSweep: 0.7,
      pumpSummary: 'neutral',
      htfSrReason: 'SHADOW: would block — LONG near HTF resistance 0.755 (1h, 12× rejected)',
      candleSummary:
        '15m: after quiet phase one oversized push into resistance, immediate upper wick reject',
      netMovePct: 0.3,
      rangePosition: 0.82,
    },
  },
  {
    name: 'LINK dip LONG steady recovery',
    input: {
      coin: 'LINK',
      direction: 'LONG',
      confidence: 71,
      directionalTfCount: 2,
      trendAlignment: 65,
      h1Trend: 'UP',
      mtfBreakdown: '15m LONG 70% | 1h LONG 72%',
      profileName: 'bull_market',
      primaryDirection: 'LONG',
      pumpPhase: 'at_sweep_low',
      pumpApex: 14.2,
      positionInSweep: 0.12,
      pumpSummary: 'at sweep low — turnaround zone',
      htfSrReason: null,
      candleSummary:
        '15m: several equal-sized greens off sweep low vs prior 12 — trend tendency not exhaustion',
      netMovePct: 0.05,
      rangePosition: 0.28,
    },
  },
  {
    name: 'DOGE SHORT at sweep — oversized dump candle',
    input: {
      coin: 'DOGE',
      direction: 'SHORT',
      confidence: 76,
      directionalTfCount: 2,
      trendAlignment: 70,
      h1Trend: 'DOWN',
      mtfBreakdown: '5m SHORT | 1m SHORT',
      profileName: 'bear_market',
      primaryDirection: 'SHORT',
      pumpPhase: 'at_sweep_low',
      pumpApex: 0.08,
      positionInSweep: 0.08,
      pumpSummary: 'at sweep low — do not sell the dip',
      htfSrReason: 'SHORT near HTF support',
      candleSummary:
        '5m: single oversized red after quiet range into lows — exhaustion dump, risk of bounce',
      netMovePct: -0.4,
      rangePosition: 0.1,
    },
  },
  {
    name: 'ADA chop LONG mixed candle sizes',
    input: {
      coin: 'ADA',
      direction: 'LONG',
      confidence: 55,
      directionalTfCount: 2,
      trendAlignment: 50,
      h1Trend: 'SIDEWAYS',
      mtfBreakdown: '15m LONG 55% | 1h FLAT',
      profileName: 'bull_market',
      primaryDirection: 'LONG',
      pumpPhase: 'neutral',
      pumpApex: 0.45,
      positionInSweep: 0.5,
      pumpSummary: 'neutral',
      htfSrReason: null,
      candleSummary: '15m: alternating large/small bodies, no coherent relative-size trend',
      netMovePct: 0,
      rangePosition: 0.5,
    },
  },
];

async function main() {
  // Offline parse checks for schema A
  console.log('=== SCHEMA A PARSE CHECKS ===');
  const hold = parseLlmJson('{"verdict":"hold","confidence":50,"reason":"wait"}', 'LONG');
  const flip = parseLlmJson(
    '{"verdict":"flip","confidence":82,"reason":"oversized candle exhaustion after quiet 12 bars"}',
    'LONG'
  );
  const allow = parseLlmJson(
    '{"verdict":"allow","confidence":70,"reason":"even green candles vs last 10 — durable trend"}',
    'LONG'
  );
  console.log(JSON.stringify({ hold, flip, allow }, null, 2));

  console.log('\n=== EXAMPLE REQUEST PAYLOAD (schema A, scenario 1) ===\n');
  const samplePayload = buildGeminiRequestPayload(scenarios[0].input);
  console.log(JSON.stringify(samplePayload, null, 2));

  const hasKey = !!(
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.DEEPSEEK_API_KEY
  );
  if (!hasKey) {
    console.error('\nGEMINI_API_KEY missing — printing offline example reasonings only.\n');
    const offlineReasons = [
      {
        scenario: scenarios[0].name,
        verdict: 'flip',
        direction: 'SHORT',
        reason:
          '15m: single oversized green after quiet 10 bars into apex, next bar rejects — exhaustion, flip SHORT',
      },
      {
        scenario: scenarios[1].name,
        verdict: 'flip',
        direction: 'SHORT',
        reason:
          '15m spike 3× avg range into high after small bodies — classic exhaustion, not trend confirm',
      },
      {
        scenario: scenarios[2].name,
        verdict: 'allow',
        direction: 'LONG',
        reason:
          '15m: 8 similar-sized greens off sweep vs prior range — durable trend tendency, allow LONG',
      },
      {
        scenario: scenarios[3].name,
        verdict: 'allow',
        direction: 'SHORT',
        reason: '5m even reds off apex relative to last 10 — continuation SHORT ok',
      },
      {
        scenario: scenarios[4].name,
        verdict: 'block',
        direction: 'LONG',
        reason:
          '15m oversized push into HTF resistance then upper-wick reject — exhaustion into supply, block LONG',
      },
      {
        scenario: scenarios[5].name,
        verdict: 'allow',
        direction: 'LONG',
        reason: 'Equal-sized greens off sweep low vs prior 12 — trend not exhaustion, allow',
      },
      {
        scenario: scenarios[6].name,
        verdict: 'flip',
        direction: 'LONG',
        reason:
          '5m single oversized red into sweep low after quiet — dump exhaustion, flip away from SHORT',
      },
      {
        scenario: scenarios[7].name,
        verdict: 'block',
        direction: 'LONG',
        reason: 'Alternating candle sizes, no coherent relative trend — chop, block',
      },
    ];
    console.log('=== EXAMPLE REASONINGS (candle-shape, offline until key set) ===\n');
    for (const r of offlineReasons) {
      console.log(JSON.stringify(r, null, 2));
      console.log('---');
    }
    process.exit(0);
  }

  console.log('\n=== LIVE GEMINI OUTPUTS ===\n');
  for (const s of scenarios) {
    const out = await confirmTradeWithLlm(s.input);
    const row = {
      scenario: s.name,
      proposed: s.input.direction,
      pumpPhase: s.input.pumpPhase,
      visionTfs: out.visionTimeframes,
      model: {
        verdict: out.verdict,
        direction: out.direction,
        confidence: out.confidence,
        reason: out.reason,
        hardRuleApplied: out.hardRuleApplied,
        timedOut: out.timedOut,
        latencyMs: out.latencyMs,
      },
    };
    console.log(JSON.stringify(row, null, 2));
    console.log('---');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
