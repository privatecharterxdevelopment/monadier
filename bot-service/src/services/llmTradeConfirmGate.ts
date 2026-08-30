/**
 * Gemini Vision ENTRY LOCATION validator — not a signal generator.
 *
 * Charts (both LONG and SHORT): 5m + 15m + 1h + 4h.
 * Decision: ALLOW | BLOCK. Never flip direction.
 * Any parse/timeout/key/chart failure: fail-closed (no open).
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import type { PumpSweepAnalysis } from './pumpSweepAnalytics';
import { signalEngine } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import {
  renderCandlestickPng,
  visionCandleLimit,
  visionMinUsableCandles,
  visionTimeframesForDirection,
  VISION_STRUCTURE_TIMEFRAMES,
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
  rangePosition1h?: number | null;
  rangePosition4h?: number | null;
  impulse15mATR?: number | null;
  consecutiveDirectionCandles?: number | null;
  deterministicLocationDecision?: 'ALLOW' | 'BLOCK' | null;
};

export type VisionLocationLabel =
  | 'BOTTOM'
  | 'LOWER_RANGE'
  | 'MID_RANGE'
  | 'UPPER_RANGE'
  | 'TOP';
export type VisionExtensionLabel = 'LOW' | 'MEDIUM' | 'HIGH';
export type VisionNearestStructure = 'SUPPORT' | 'RESISTANCE' | 'NONE';

export type LlmTradeConfirmResult = {
  ok: boolean;
  verdict: LlmTradeVerdict;
  decision: 'ALLOW' | 'BLOCK';
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
  location: VisionLocationLabel | null;
  extension: VisionExtensionLabel | null;
  nearestStructure: VisionNearestStructure | null;
  failureReason?: string;
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
  decision: 'ALLOW' | 'BLOCK';
  direction: 'LONG' | 'SHORT';
  confidence: number;
  reason: string;
  location: VisionLocationLabel;
  extension: VisionExtensionLabel;
  nearestStructure: VisionNearestStructure;
};

const LOCATIONS = new Set(['BOTTOM', 'LOWER_RANGE', 'MID_RANGE', 'UPPER_RANGE', 'TOP']);
const EXTENSIONS = new Set(['LOW', 'MEDIUM', 'HIGH']);
const NEAREST = new Set(['SUPPORT', 'RESISTANCE', 'NONE']);

function asUpper(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toUpperCase();
}

/**
 * Location-validator schema. Missing/unknown required fields → null (fail-closed).
 * Flip / opposite-direction hints → BLOCK, never LONG↔SHORT.
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
    const decisionRaw = asUpper(obj.decision || obj.verdict);
    if (decisionRaw !== 'ALLOW' && decisionRaw !== 'BLOCK' && decisionRaw !== 'FLIP') {
      return null;
    }
    const location = asUpper(obj.location);
    const extension = asUpper(obj.extension);
    const nearest = asUpper(obj.nearest_structure ?? obj.nearestStructure);
    if (!LOCATIONS.has(location) || !EXTENSIONS.has(extension) || !NEAREST.has(nearest)) {
      return null;
    }
    const reason = String(obj.reason ?? '').trim().slice(0, 500);
    if (!reason) return null;
    const confidence = Number(obj.confidence);
    if (!Number.isFinite(confidence)) return null;

    let decision: 'ALLOW' | 'BLOCK' = decisionRaw === 'ALLOW' ? 'ALLOW' : 'BLOCK';
    let reasonOut = reason;
    if (decisionRaw === 'FLIP') {
      decision = 'BLOCK';
      reasonOut = `vision flip refused (no guess): ${reason}`;
    }

    return {
      verdict: decision === 'ALLOW' ? 'allow' : 'block',
      decision,
      direction: proposedDirection,
      confidence: Math.max(0, Math.min(100, confidence)),
      reason: reasonOut,
      location: location as VisionLocationLabel,
      extension: extension as VisionExtensionLabel,
      nearestStructure: nearest as VisionNearestStructure,
    };
  } catch {
    return null;
  }
}

function applyLocationSanity(
  proposed: 'LONG' | 'SHORT',
  parsed: ParsedLlmJson
): ParsedLlmJson {
  if (parsed.decision !== 'ALLOW') return parsed;
  if (parsed.confidence < 50) {
    return {
      ...parsed,
      verdict: 'block',
      decision: 'BLOCK',
      reason: `Vision uncertain (confidence ${parsed.confidence}) — fail-closed: ${parsed.reason}`,
    };
  }
  if (proposed === 'LONG' && parsed.location === 'TOP' && parsed.extension === 'HIGH') {
    return {
      ...parsed,
      verdict: 'block',
      decision: 'BLOCK',
      reason: `Vision labels contradict ALLOW (TOP+HIGH) — fail-closed: ${parsed.reason}`,
    };
  }
  if (proposed === 'SHORT' && parsed.location === 'BOTTOM' && parsed.extension === 'HIGH') {
    return {
      ...parsed,
      verdict: 'block',
      decision: 'BLOCK',
      reason: `Vision labels contradict ALLOW (BOTTOM+HIGH) — fail-closed: ${parsed.reason}`,
    };
  }
  return parsed;
}

/** Example / smoke helper — text prompt + schema (images omitted). */
export function buildGeminiRequestPayload(input: LlmTradeConfirmInput): {
  model: string;
  schema: {
    decision: string;
    location: string;
    extension: string;
    nearest_structure: string;
    confidence: string;
    reason: string;
  };
  prompt: string;
  visionTimeframes: VisionChartTimeframe[];
} {
  const cfg = config.hyperliquid.llmTradeConfirm;
  const tfs = visionTimeframesForDirection(input.direction);
  return {
    model: cfg.model,
    schema: {
      decision: "'ALLOW'|'BLOCK'",
      location: "'BOTTOM'|'LOWER_RANGE'|'MID_RANGE'|'UPPER_RANGE'|'TOP'",
      extension: "'LOW'|'MEDIUM'|'HIGH'",
      nearest_structure: "'SUPPORT'|'RESISTANCE'|'NONE'",
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
  return { result: parsed, hardRuleApplied: false };
}

function timeoutFallback(
  input: LlmTradeConfirmInput,
  latencyMs: number,
  visionTimeframes: VisionChartTimeframe[],
  why: string
): LlmTradeConfirmResult {
  const cfg = config.hyperliquid.llmTradeConfirm;
  return {
    ok: false,
    verdict: 'block',
    decision: 'BLOCK',
    direction: input.direction,
    enforce: true,
    shadow: false,
    confidence: 0,
    reason: why,
    latencyMs,
    provider: cfg.provider,
    model: cfg.model,
    hardRuleApplied: false,
    timedOut: true,
    visionTimeframes,
    location: null,
    extension: null,
    nearestStructure: null,
    failureReason: why,
  };
}

function buildTextPrompt(input: LlmTradeConfirmInput, tfs: VisionChartTimeframe[]): string {
  return [
    'You are an ENTRY LOCATION validator, not a trade signal generator.',
    `A deterministic trading system proposes a ${input.direction} trade.`,
    `Analyze the supplied ${tfs.join(', ')} candlestick charts.`,
    'Your only task is determining whether CURRENT PRICE is a sensible entry location for the proposed direction.',
    '',
    'Do not generate trade direction. Do not recommend another direction. Do not flip the trade.',
    'When uncertain, BLOCK.',
    '',
    `For LONG, BLOCK if any major issue exists such as:`,
    '* current price near local/HTF swing high',
    '* price extended after strong bullish impulse',
    '* resistance directly above',
    '* repeated bullish candles indicating late entry/chasing',
    '* upper-wick rejection',
    '* apex/blow-off structure',
    '* poor upside room',
    '* 1h/4h distribution or lower-high structure',
    '* ambiguous structure',
    '',
    `For SHORT, BLOCK if any major issue exists such as:`,
    '* current price near local/HTF swing low',
    '* price extended after strong bearish impulse',
    '* support directly below',
    '* repeated bearish candles indicating late entry/chasing',
    '* lower-wick rejection',
    '* capitulation/sweep-low structure',
    '* poor downside room',
    '* bullish HTF reversal structure',
    '* ambiguous structure',
    '',
    'Return strict JSON only:',
    '{"decision":"ALLOW"|"BLOCK","location":"BOTTOM"|"LOWER_RANGE"|"MID_RANGE"|"UPPER_RANGE"|"TOP","extension":"LOW"|"MEDIUM"|"HIGH","nearest_structure":"SUPPORT"|"RESISTANCE"|"NONE","confidence":0-100,"reason":"short reason"}',
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
        deterministicLocation: {
          decision: input.deterministicLocationDecision,
          rangePosition1h: input.rangePosition1h,
          rangePosition4h: input.rangePosition4h,
          impulse15mATR: input.impulse15mATR,
          consecutiveDirectionCandles: input.consecutiveDirectionCandles,
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
    const limit = visionCandleLimit(tf);
    try {
      const candles = await signalEngine.fetchCandles(symbol, tf, limit);
      if (candles.length < visionMinUsableCandles(tf)) {
        logger.warn('Chart vision snapshot too short', {
          coin,
          tf,
          candles: candles.length,
          need: visionMinUsableCandles(tf),
        });
        continue;
      }
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
          maxOutputTokens: 360,
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
 * Entry-location Vision gate. Fail-closed on any error. Never flips direction.
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
      ok: false,
      verdict: 'block',
      decision: 'BLOCK',
      direction: enriched.direction,
      enforce: true,
      shadow: false,
      confidence: 0,
      reason: 'LLM/vision gate disabled — fail-closed (no open without chart review)',
      latencyMs: 0,
      provider: cfg.provider,
      model: cfg.model,
      hardRuleApplied: false,
      timedOut: false,
      visionTimeframes: visionTfs,
      location: null,
      extension: null,
      nearestStructure: null,
      failureReason: 'gate_disabled',
    };
  }

  if (!cfg.apiKey) {
    return {
      ok: false,
      verdict: 'block',
      decision: 'BLOCK',
      direction: enriched.direction,
      enforce: true,
      shadow: false,
      confidence: 0,
      reason: 'LLM/vision key missing — fail-closed (no open without chart review)',
      latencyMs: 0,
      provider: cfg.provider,
      model: cfg.model,
      hardRuleApplied: false,
      timedOut: false,
      visionTimeframes: visionTfs,
      location: null,
      extension: null,
      nearestStructure: null,
      failureReason: 'missing_api_key',
    };
  }

  const started = Date.now();
  try {
    const shots = await captureDirectionChartShots(enriched.coin, enriched.direction);
    const missing = VISION_STRUCTURE_TIMEFRAMES.filter(
      (tf) => !shots.some((s) => s.timeframe === tf)
    );
    if (shots.length === 0 || missing.length > 0) {
      throw new Error(
        missing.length > 0
          ? `Unusable/missing chart TFs: ${missing.join(',')}`
          : 'No chart snapshots captured for vision'
      );
    }
    const raw = await callGeminiVision(enriched, shots, cfg.timeoutMs);
    const latencyMs = Date.now() - started;
    const parsedRaw = parseLlmJson(raw, enriched.direction);
    if (!parsedRaw) {
      logger.warn('Gemini trade confirm: malformed JSON', {
        coin: enriched.coin,
        raw: raw.slice(0, 240),
      });
      const fallback = timeoutFallback(
        enriched,
        latencyMs,
        visionTfs,
        'LLM/vision malformed JSON or missing required fields — fail-closed (no open)'
      );
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

    const parsed = applyLocationSanity(enriched.direction, parsedRaw);
    const { result, hardRuleApplied } = applyHardApexRules(enriched, parsed);
    const ok = result.decision === 'ALLOW';

    const out: LlmTradeConfirmResult = {
      ok,
      verdict: result.verdict,
      decision: result.decision,
      direction: result.direction,
      enforce: true,
      shadow: false,
      confidence: result.confidence,
      reason: result.reason,
      latencyMs,
      provider: cfg.provider,
      model: cfg.model,
      hardRuleApplied,
      timedOut: false,
      visionTimeframes: shots.map((s) => s.timeframe),
      location: result.location,
      extension: result.extension,
      nearestStructure: result.nearestStructure,
    };

    remember({
      at: new Date().toISOString(),
      coin: enriched.coin,
      proposedDirection: enriched.direction,
      verdict: out.verdict,
      direction: out.direction,
      reason: out.reason,
      latencyMs,
      shadow: false,
      hardRuleApplied,
      timedOut: false,
      visionTimeframes: out.visionTimeframes,
    });

    logger.info('Gemini vision entry-location validator', {
      coin: enriched.coin,
      proposed: enriched.direction,
      decision: out.decision,
      location: out.location,
      extension: out.extension,
      nearest_structure: out.nearestStructure,
      tfs: out.visionTimeframes,
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
    const fallback = timeoutFallback(
      enriched,
      latencyMs,
      visionTfs,
      `LLM/vision unavailable — fail-closed (${msg.slice(0, 120)})`
    );
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
