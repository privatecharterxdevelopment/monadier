/**
 * LLM second-opinion gate before HL opens — Gemini Vision on real candles.
 *
 * Chart rules (hard):
 *   LONG  → vision ONLY 15m + 1h
 *   SHORT → vision ONLY 1m + 5m
 *
 * Verdicts: allow | block | flip.
 * No apex/resistance SHORT flips — dump shorts come from the SHORT stack.
 * Timeout/network errors always fail-open (no auto flip).
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import type { PumpSweepAnalysis } from './pumpSweepAnalytics';
import { signalEngine } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import {
  renderCandlestickPng,
  visionTimeframesForDirection,
  type ChartVisionShot,
  type VisionChartTimeframe,
} from './chartVisionSnapshot';

export type LlmTradeVerdict = 'allow' | 'block' | 'flip';

export type LlmTradeConfirmInput = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  mtfBreakdown?: string;
  h1Trend?: string;
  directionalTfCount?: number;
  trendAlignment?: number;
  profileName: string;
  primaryDirection: 'LONG' | 'SHORT';
  pumpPhase?: string | null;
  pumpApex?: number | null;
  positionInSweep?: number | null;
  pumpSummary?: string | null;
  htfSrReason?: string | null;
  candleSummary?: string | null;
  netMovePct?: number | null;
  rangePosition?: number | null;
};

export type LlmTradeConfirmResult = {
  ok: boolean;
  verdict: LlmTradeVerdict;
  direction: 'LONG' | 'SHORT';
  enforce: boolean;
  shadow: boolean;
  confidence: number;
  reason: string;
  latencyMs: number;
  provider: string;
  model: string;
  hardRuleApplied: boolean;
  timedOut: boolean;
  visionTimeframes?: VisionChartTimeframe[];
};

export type LlmGateLastVerdict = {
  at: string;
  coin: string;
  proposedDirection: 'LONG' | 'SHORT';
  verdict: LlmTradeVerdict;
  direction: 'LONG' | 'SHORT';
  reason: string;
  latencyMs: number;
  shadow: boolean;
  hardRuleApplied: boolean;
  timedOut: boolean;
  visionTimeframes?: VisionChartTimeframe[];
};

let lastVerdict: LlmGateLastVerdict | null = null;

export function getLastLlmTradeConfirmVerdict(): LlmGateLastVerdict | null {
  return lastVerdict;
}

function remember(v: LlmGateLastVerdict): void {
  lastVerdict = v;
}

type ParsedLlmJson = {
  verdict: LlmTradeVerdict;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  reason: string;
};

/**
 * Schema A: { verdict: allow|block|flip, confidence, reason }.
 * hold / unknown verdict → parse failure (caller fail-opens).
 * Optional legacy `direction` field is accepted but ignored when it conflicts with flip math.
 */
export function parseLlmJson(
  raw: string,
  proposedDirection: 'LONG' | 'SHORT' = 'LONG'
): ParsedLlmJson | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    const verdictRaw = String(obj.verdict ?? '').toLowerCase();
    // hold / anything else = parse error → fail-open upstream
    if (verdictRaw !== 'allow' && verdictRaw !== 'block' && verdictRaw !== 'flip') {
      return null;
    }
    const verdict = verdictRaw as LlmTradeVerdict;
    const opposite: 'LONG' | 'SHORT' =
      proposedDirection === 'LONG' ? 'SHORT' : 'LONG';
    const direction: 'LONG' | 'SHORT' =
      verdict === 'flip' ? opposite : proposedDirection;
    const confidence = Number(obj.confidence);
    const reason = String(obj.reason ?? '').slice(0, 500) || 'no reason';
    return {
      verdict,
      direction,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0,
      reason,
    };
  } catch {
    return null;
  }
}

/** Example / smoke helper — text prompt + schema (images omitted). */
export function buildGeminiRequestPayload(input: LlmTradeConfirmInput): {
  model: string;
  schema: { verdict: string; confidence: string; reason: string };
  prompt: string;
  visionTimeframes: VisionChartTimeframe[];
} {
  const cfg = config.hyperliquid.llmTradeConfirm;
  const tfs = visionTimeframesForDirection(input.direction);
  return {
    model: cfg.model,
    schema: {
      verdict: "'allow'|'block'|'flip'",
      confidence: '0-100',
      reason: 'short string',
    },
    prompt: buildTextPrompt(input, tfs),
    visionTimeframes: tfs,
  };
}

function applyHardApexRules(
  _input: LlmTradeConfirmInput,
  parsed: ParsedLlmJson
): { result: ParsedLlmJson; hardRuleApplied: boolean } {
  // No resistance / apex SHORT flips — dump shorts come from the SHORT stack.
  return { result: parsed, hardRuleApplied: false };
}

function timeoutFallback(
  input: LlmTradeConfirmInput,
  latencyMs: number,
  visionTimeframes: VisionChartTimeframe[]
): LlmTradeConfirmResult {
  const cfg = config.hyperliquid.llmTradeConfirm;
  return {
    ok: true,
    verdict: 'allow',
    direction: input.direction,
    enforce: false,
    shadow: cfg.mode === 'shadow',
    confidence: 0,
    reason: 'LLM/vision timeout/unavailable — fail-open (no direction change on network error)',
    latencyMs,
    provider: cfg.provider,
    model: cfg.model,
    hardRuleApplied: false,
    timedOut: true,
    visionTimeframes,
  };
}

function buildTextPrompt(input: LlmTradeConfirmInput, tfs: VisionChartTimeframe[]): string {
  return [
    'You are a crypto perp pre-trade risk reviewer. You are given candlestick chart IMAGE(S).',
    `Direction proposed: ${input.direction}. Vision timeframes for this side: ${tfs.join(', ')}.`,
    'LONG setups are judged ONLY on 15m/1h structure. SHORT setups ONLY on 1m/5m structure.',
    'Look at the chart(s): is price at a local peak (do not LONG), at a sweep low (do not SHORT), or a clean continuation?',
    '',
    'Candle-shape tendency (soft, not a hard veto):',
    '- Compare recent candle size to the prior 8–15 candles on the same timeframe — relative, not absolute.',
    '- A single clearly oversized candle after a quiet/small-range phase can be exhaustion (more reversal than trend confirmation), especially if the next candle rejects it immediately.',
    '- Several similar-sized candles in one direction lean toward a durable trend.',
    '- Use this only as tendency in your reason text; do not invent a separate verdict type.',
    '',
    'Verdict schema (strict — no hold):',
    '{"verdict":"allow"|"block"|"flip","confidence":0-100,"reason":"short"}',
    '- allow = take the proposed direction',
    '- block = skip the trade entirely',
    '- flip = take the OPPOSITE direction (bot LONG → you want SHORT, or bot SHORT → you want LONG)',
    '- If unsure, still choose allow|block|flip. Never return hold or any other verdict string — invalid values are treated as parse failure (fail-open).',
    '',
    'Reply with ONLY one JSON object matching the schema above (no markdown, no direction field).',
    '',
    'Numeric context (secondary to the images):',
    JSON.stringify(
      {
        coin: input.coin,
        proposedDirection: input.direction,
        signalConfidence: input.confidence,
        directionalTfCount: input.directionalTfCount,
        trendAlignment: input.trendAlignment,
        h1Trend: input.h1Trend,
        mtfBreakdown: input.mtfBreakdown,
        profile: input.profileName,
        primaryDirection: input.primaryDirection,
        pump: {
          phase: input.pumpPhase,
          apex: input.pumpApex,
          positionInSweep: input.positionInSweep,
          summary: input.pumpSummary,
        },
        htfSr: input.htfSrReason,
        candles: {
          summary: input.candleSummary,
          netMovePct: input.netMovePct,
          rangePosition: input.rangePosition,
        },
        visionTimeframes: tfs,
      },
      null,
      0
    ),
  ].join('\n');
}

export async function captureDirectionChartShots(
  coin: string,
  direction: 'LONG' | 'SHORT'
): Promise<ChartVisionShot[]> {
  const symbol = hlCoinToBinanceSymbol(coin);
  const tfs = visionTimeframesForDirection(direction);
  const shots: ChartVisionShot[] = [];
  for (const tf of tfs) {
    const limit = tf === '1m' ? 60 : 48;
    try {
      const candles = await signalEngine.fetchCandles(symbol, tf, limit);
      const png = renderCandlestickPng(candles);
      shots.push({
        timeframe: tf,
        mimeType: 'image/png',
        base64: png.toString('base64'),
        candleCount: candles.length,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('Chart vision snapshot failed', { coin, tf, error: msg.slice(0, 160) });
    }
  }
  return shots;
}

async function callGeminiVision(
  input: LlmTradeConfirmInput,
  shots: ChartVisionShot[],
  timeoutMs: number
): Promise<string> {
  const cfg = config.hyperliquid.llmTradeConfirm;
  const key = cfg.apiKey;
  if (!key) throw new Error('GEMINI_API_KEY missing');

  const tfs = shots.map((s) => s.timeframe);
  const parts: Array<Record<string, unknown>> = [
    { text: buildTextPrompt(input, tfs) },
  ];
  for (const shot of shots) {
    parts.push({ text: `Chart image: ${input.coin} ${shot.timeframe} (${shot.candleCount} candles)` });
    parts.push({
      inline_data: {
        mime_type: shot.mimeType,
        data: shot.base64,
      },
    });
  }

  const url = `${cfg.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(key)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 280,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 240)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) throw new Error('Gemini empty content');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Second-opinion gate with Gemini Vision charts.
 * Shadow mode: never blocks the open path (ok:true) but still returns verdict for logging.
 * Enforce mode: block/flip applied by caller.
 */
export async function confirmTradeWithLlm(
  input: LlmTradeConfirmInput,
  pump?: PumpSweepAnalysis | null
): Promise<LlmTradeConfirmResult> {
  const cfg = config.hyperliquid.llmTradeConfirm;
  const enriched: LlmTradeConfirmInput = {
    ...input,
    pumpPhase: input.pumpPhase ?? pump?.phase ?? null,
    pumpApex: input.pumpApex ?? pump?.pumpApex ?? null,
    positionInSweep: input.positionInSweep ?? pump?.positionInSweep ?? null,
    pumpSummary: input.pumpSummary ?? pump?.summary ?? null,
  };
  const visionTfs = visionTimeframesForDirection(enriched.direction);

  if (!cfg.enabled) {
    return {
      ok: true,
      verdict: 'allow',
      direction: enriched.direction,
      enforce: false,
      shadow: true,
      confidence: 100,
      reason: 'LLM gate disabled',
      latencyMs: 0,
      provider: cfg.provider,
      model: cfg.model,
      hardRuleApplied: false,
      timedOut: false,
      visionTimeframes: visionTfs,
    };
  }

  if (!cfg.apiKey) {
    return {
      ok: true,
      verdict: 'allow',
      direction: enriched.direction,
      enforce: false,
      shadow: cfg.mode === 'shadow',
      confidence: 0,
      reason: 'LLM/vision key missing — fail-open (no apex SHORT flip)',
      latencyMs: 0,
      provider: cfg.provider,
      model: cfg.model,
      hardRuleApplied: false,
      timedOut: false,
      visionTimeframes: visionTfs,
    };
  }

  const started = Date.now();
  try {
    const shots = await captureDirectionChartShots(enriched.coin, enriched.direction);
    if (shots.length === 0) {
      throw new Error('No chart snapshots captured for vision');
    }
    const raw = await callGeminiVision(enriched, shots, cfg.timeoutMs);
    const latencyMs = Date.now() - started;
    const parsed = parseLlmJson(raw, enriched.direction);
    if (!parsed) {
      logger.warn('Gemini trade confirm: malformed JSON', {
        coin: enriched.coin,
        raw: raw.slice(0, 240),
      });
      const fallback = timeoutFallback(enriched, latencyMs, visionTfs);
      remember({
        at: new Date().toISOString(),
        coin: enriched.coin,
        proposedDirection: enriched.direction,
        verdict: fallback.verdict,
        direction: fallback.direction,
        reason: fallback.reason,
        latencyMs,
        shadow: fallback.shadow,
        hardRuleApplied: false,
        timedOut: true,
        visionTimeframes: visionTfs,
      });
      return fallback;
    }

    const { result, hardRuleApplied } = applyHardApexRules(enriched, parsed);
    const shadow = cfg.mode === 'shadow';
    const enforce = cfg.mode === 'enforce';
    let ok = true;
    if (enforce && result.verdict === 'block') ok = false;

    const out: LlmTradeConfirmResult = {
      ok,
      verdict: result.verdict,
      direction: result.direction,
      enforce,
      shadow,
      confidence: result.confidence,
      reason: result.reason,
      latencyMs,
      provider: cfg.provider,
      model: cfg.model,
      hardRuleApplied,
      timedOut: false,
      visionTimeframes: shots.map((s) => s.timeframe),
    };

    remember({
      at: new Date().toISOString(),
      coin: enriched.coin,
      proposedDirection: enriched.direction,
      verdict: out.verdict,
      direction: out.direction,
      reason: out.reason,
      latencyMs,
      shadow,
      hardRuleApplied,
      timedOut: false,
      visionTimeframes: out.visionTimeframes,
    });

    logger.info('Gemini vision trade confirm', {
      coin: enriched.coin,
      proposed: enriched.direction,
      verdict: out.verdict,
      direction: out.direction,
      tfs: out.visionTimeframes,
      shadow,
      hardRuleApplied,
      latencyMs,
      reason: out.reason.slice(0, 160),
    });

    return out;
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Gemini vision trade confirm failed', {
      coin: enriched.coin,
      error: msg.slice(0, 200),
      latencyMs,
    });
    const fallback = timeoutFallback(enriched, latencyMs, visionTfs);
    remember({
      at: new Date().toISOString(),
      coin: enriched.coin,
      proposedDirection: enriched.direction,
      verdict: fallback.verdict,
      direction: fallback.direction,
      reason: fallback.reason,
      latencyMs,
      shadow: fallback.shadow,
      hardRuleApplied: false,
      timedOut: true,
      visionTimeframes: visionTfs,
    });
    return fallback;
  }
}
