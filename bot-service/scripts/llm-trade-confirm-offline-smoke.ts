/**
 * Offline smoke: exact request payload shape + local hard-rule/timeout outputs.
 * No config import, no secrets, no network.
 *
 * Live DeepSeek model outputs require:
 *   DEEPSEEK_API_KEY=sk-... npx tsx scripts/llm-trade-confirm-smoke.ts
 */
type Input = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  pumpPhase: string;
  mtfBreakdown: string;
  h1Trend: string;
  htfSrReason: string | null;
  candleSummary: string;
  rangePosition: number;
};

function buildPayload(input: Input) {
  const userContent = [
    'You are a crypto perp pre-trade risk reviewer for Hyperliquid.',
    'Reply with ONLY one JSON object, no markdown:',
    '{"verdict":"allow"|"block"|"flip","direction":"LONG"|"SHORT","confidence":0-100,"reason":"short"}',
    '',
    'Rules:',
    '- If price is at pump apex / local peak, NEVER allow LONG — use flip to SHORT (liquidity grab) or block.',
    '- Prefer block when entry is into strong opposite HTF resistance/support.',
    '- flip means the bot should open the opposite direction instead.',
    '- Be concise in reason (<= 200 chars).',
    '',
    'Context:',
    JSON.stringify({
      coin: input.coin,
      proposedDirection: input.direction,
      signalConfidence: input.confidence,
      h1Trend: input.h1Trend,
      mtfBreakdown: input.mtfBreakdown,
      pump: { phase: input.pumpPhase },
      htfSr: input.htfSrReason,
      candles: { summary: input.candleSummary, rangePosition: input.rangePosition },
    }),
  ].join('\n');

  return {
    model: 'deepseek-chat',
    temperature: 0.1,
    max_tokens: 220,
    messages: [
      {
        role: 'system',
        content: 'You output only valid JSON for trade allow/block/flip decisions. No prose.',
      },
      { role: 'user', content: userContent },
    ],
  };
}

/** Mirrors current timeoutFallback after the fail-open fix. */
function timeoutFailOpen(input: Input) {
  return {
    verdict: 'allow' as const,
    direction: input.direction,
    confidence: 0,
    reason: 'LLM timeout/unavailable — fail-open (no direction change on network error)',
    hardRuleApplied: false,
    timedOut: true,
    note: 'No chart image; text-only path. Existing rule gates still apply.',
  };
}

/** Mirrors no-key path — fail-open, no apex SHORT flip. */
function noKeyApexHardRule(input: Input) {
  return {
    verdict: 'allow' as const,
    direction: input.direction,
    confidence: 0,
    reason: 'LLM/vision key missing — fail-open (no apex SHORT flip)',
    hardRuleApplied: false,
    timedOut: false,
  };
}

const scenarios: Array<{ name: string; input: Input }> = [
  {
    name: 'HYPE peak LONG',
    input: {
      coin: 'HYPE',
      direction: 'LONG',
      confidence: 100,
      pumpPhase: 'at_apex',
      mtfBreakdown: '15m LONG 100% | 1h LONG 100%',
      h1Trend: 'UP',
      htfSrReason: 'LONG near HTF resistance 61.40',
      candleSummary: '15m rangePos 0.95',
      rangePosition: 0.95,
    },
  },
  {
    name: 'BTC apex LONG',
    input: {
      coin: 'BTC',
      direction: 'LONG',
      confidence: 93,
      pumpPhase: 'at_apex',
      mtfBreakdown: '15m LONG 90% | 1h LONG 100%',
      h1Trend: 'UP',
      htfSrReason: null,
      candleSummary: '15m rangePos 0.88',
      rangePosition: 0.88,
    },
  },
  {
    name: 'ETH turnaround LONG',
    input: {
      coin: 'ETH',
      direction: 'LONG',
      confidence: 78,
      pumpPhase: 'near_turnaround',
      mtfBreakdown: '15m LONG 70% | 1h LONG 80%',
      h1Trend: 'SIDEWAYS',
      htfSrReason: null,
      candleSummary: '15m rangePos 0.35',
      rangePosition: 0.35,
    },
  },
  {
    name: 'SOL SHORT at apex',
    input: {
      coin: 'SOL',
      direction: 'SHORT',
      confidence: 82,
      pumpPhase: 'at_apex',
      mtfBreakdown: '15m SHORT 85% | 1h SHORT 80%',
      h1Trend: 'DOWN',
      htfSrReason: null,
      candleSummary: '5m rangePos 0.9',
      rangePosition: 0.9,
    },
  },
  {
    name: 'SUI LONG into HTF resistance',
    input: {
      coin: 'SUI',
      direction: 'LONG',
      confidence: 88,
      pumpPhase: 'neutral',
      mtfBreakdown: '5m/15m/1h LONG',
      h1Trend: 'UP',
      htfSrReason: 'LONG near HTF resistance 0.755 (12× rejected)',
      candleSummary: '15m rangePos 0.82',
      rangePosition: 0.82,
    },
  },
  {
    name: 'LINK dip LONG at sweep low',
    input: {
      coin: 'LINK',
      direction: 'LONG',
      confidence: 71,
      pumpPhase: 'at_sweep_low',
      mtfBreakdown: '15m LONG 70% | 1h LONG 72%',
      h1Trend: 'UP',
      htfSrReason: null,
      candleSummary: '15m rangePos 0.28',
      rangePosition: 0.28,
    },
  },
  {
    name: 'DOGE SHORT at sweep low',
    input: {
      coin: 'DOGE',
      direction: 'SHORT',
      confidence: 76,
      pumpPhase: 'at_sweep_low',
      mtfBreakdown: '15m SHORT | 1h SHORT',
      h1Trend: 'DOWN',
      htfSrReason: 'SHORT near HTF support',
      candleSummary: '15m rangePos 0.1',
      rangePosition: 0.1,
    },
  },
  {
    name: 'ADA weak chop LONG',
    input: {
      coin: 'ADA',
      direction: 'LONG',
      confidence: 55,
      pumpPhase: 'neutral',
      mtfBreakdown: '15m LONG 55% | 1h FLAT',
      h1Trend: 'SIDEWAYS',
      htfSrReason: null,
      candleSummary: '15m chop rangePos 0.5',
      rangePosition: 0.5,
    },
  },
  {
    name: 'Timeout at apex LONG (fail-open)',
    input: {
      coin: 'HYPE',
      direction: 'LONG',
      confidence: 100,
      pumpPhase: 'at_apex',
      mtfBreakdown: '15m/1h LONG 100%',
      h1Trend: 'UP',
      htfSrReason: null,
      candleSummary: 'peak',
      rangePosition: 0.99,
    },
  },
];

console.log('=== 1) EXACT DEEPSEEK REQUEST PAYLOAD (text only, no screenshot) ===\n');
console.log(JSON.stringify(buildPayload(scenarios[0].input), null, 2));
console.log('\nHas image? NO — messages[].content is string only. No image_url / vision parts.');
console.log('Vision: official api.deepseek.com chat completions is TEXT-ONLY (deepseek-chat / v4).');
console.log('Need GPT-4o / Claude vision (or self-hosted DeepSeek-VL) for chart screenshots.\n');

console.log('=== 2) LOCAL PATH OUTPUTS (no API key — hard-rule / fail-open) ===\n');
for (const s of scenarios) {
  const modelPath =
    s.name.includes('Timeout') ? timeoutFailOpen(s.input) : noKeyApexHardRule(s.input);
  console.log(
    JSON.stringify(
      {
        scenario: s.name,
        proposed: s.input.direction,
        pumpPhase: s.input.pumpPhase,
        result: modelPath,
      },
      null,
      2
    )
  );
  console.log('---');
}
