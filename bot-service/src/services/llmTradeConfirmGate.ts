/**
 * OpenAI Vision picks LONG or SHORT before location gates.
 * Bot lean is context only. Fail-closed on timeout / missing key / bad JSON.
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
  chosenDirection: 'LONG' | 'SHORT' | null;
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

function oppositeSide(d: 'LONG' | 'SHORT'): 'LONG' | 'SHORT' {
  return d === 'LONG' ? 'SHORT' : 'LONG';
}

/**
 * Visual picks LONG or SHORT.
 * ALLOW / ja → proposed side. BLOCK / nein → opposite side.
 * Explicit LONG|SHORT wins.
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
    const dirRaw = asUpper(obj.direction || obj.side || obj.decision || obj.verdict);
    let direction: 'LONG' | 'SHORT' | null = null;
    if (dirRaw === 'LONG' || dirRaw === 'SHORT') {
      direction = dirRaw;
    } else if (dirRaw === 'ALLOW' || dirRaw === 'YES' || dirRaw === 'JA') {
      direction = proposedDirection;
    } else if (dirRaw === 'BLOCK' || dirRaw === 'NO' || dirRaw === 'NEIN' || dirRaw === 'FLIP') {
      direction = oppositeSide(proposedDirection);
    }
    if (!direction) return null;

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

    return {
      verdict: 'allow',
      decision: 'ALLOW',
      direction,
      confidence: Math.max(0, Math.min(100, confidence)),
      reason,
      location: location as VisionLocationLabel,
      extension: extension as VisionExtensionLabel,
      nearestStructure: nearest as VisionNearestStructure,
    };
  } catch {
    return null;
  }
}

function applyLocationSanity(
  _proposed: 'LONG' | 'SHORT',
  parsed: ParsedLlmJson
): ParsedLlmJson {
  if (parsed.confidence < 50) {
    return {
      ...parsed,
      verdict: 'block',
      decision: 'BLOCK',
      reason: `Vision uncertain (confidence ${parsed.confidence}) — no open: ${parsed.reason}`,
    };
  }
  if (parsed.direction === 'LONG' && parsed.location === 'TOP' && parsed.extension === 'HIGH') {
    return {
      ...parsed,
      verdict: 'block',
      decision: 'BLOCK',
      reason: `Vision LONG contradicted by TOP+HIGH — no open: ${parsed.reason}`,
    };
  }
  if (parsed.direction === 'SHORT' && parsed.location === 'BOTTOM' && parsed.extension === 'HIGH') {
    return {
      ...parsed,
      verdict: 'block',
      decision: 'BLOCK',
      reason: `Vision SHORT contradicted by BOTTOM+HIGH — no open: ${parsed.reason}`,
    };
  }
  return parsed;
}

/** Example / smoke helper — text prompt + schema (images omitted). */
export function buildGeminiRequestPayload(input: LlmTradeConfirmInput): {
  model: string;
  schema: {
    direction: string;
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
      direction: "'LONG'|'SHORT'",
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
    chosenDirection: null,
  };
}

function buildTextPrompt(input: LlmTradeConfirmInput, tfs: VisionChartTimeframe[]): string {
  return [
    'You decide the trade SIDE. LONG or SHORT. You are not a yes/no checker on the bot.',
    `Charts: ${tfs.join(', ')} candlesticks. Current price is the last close.`,
    `The bot currently leans ${input.direction}. Ignore that if the chart disagrees.`,
    'If the bot leans LONG: ja = LONG, nein = SHORT.',
    'If the bot leans SHORT: ja = SHORT, nein = LONG.',
    '',
    'Pick LONG when price is a sensible long entry (discount, support, range low, confirmed hold).',
    'Pick SHORT when price is a sensible short entry (premium, resistance, range high, rejection).',
    'Do not LONG a spike/top. Do not SHORT a flush/floor.',
    'When uncertain, still pick the side that matches location (high → SHORT, low → LONG) only if the location is clear; otherwise set confidence below 50.',
    '',
    'Return strict JSON only:',
    '{"direction":"LONG"|"SHORT","location":"BOTTOM"|"LOWER_RANGE"|"MID_RANGE"|"UPPER_RANGE"|"TOP","extension":"LOW"|"MEDIUM"|"HIGH","nearest_structure":"SUPPORT"|"RESISTANCE"|"NONE","confidence":0-100,"reason":"short reason"}',
    '',
    'Numeric context (secondary to the images):',
    JSON.stringify(
      {
        coin: input.coin,
        botLean: input.direction,
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

async function callOpenAiVision(
  input: LlmTradeConfirmInput,
  shots: ChartVisionShot[],
  timeoutMs: number
): Promise<string> {
  const cfg = config.hyperliquid.llmTradeConfirm;
  const key = process.env.OPENAI_API_KEY || '';
  if (!key) throw new Error('OPENAI_API_KEY missing');

  const tfs = shots.map((s) => s.timeframe);
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: buildTextPrompt(input, tfs) },
  ];
  for (const shot of shots) {
    content.push({
      type: 'text',
      text: `Chart: ${input.coin} ${shot.timeframe} (${shot.candleCount} candles)`,
    });
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${shot.mimeType};base64,${shot.base64}`,
        detail: 'low',
      },
    });
  }

  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 240)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) throw new Error('OpenAI empty content');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiVision(
  input: LlmTradeConfirmInput,
  shots: ChartVisionShot[],
  timeoutMs: number
): Promise<string> {
  const cfg = config.hyperliquid.llmTradeConfirm;
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || cfg.apiKey;
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
 * OpenAI Vision picks LONG or SHORT. Fail-closed on any error.
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
      chosenDirection: null,
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

  const openai = cfg.provider !== 'gemini';
  const keyOk = openai ? Boolean(process.env.OPENAI_API_KEY) : Boolean(cfg.apiKey);
  if (!keyOk) {
    return {
      ok: false,
      verdict: 'block',
      decision: 'BLOCK',
      direction: enriched.direction,
      chosenDirection: null,
      enforce: true,
      shadow: false,
      confidence: 0,
      reason: openai
        ? 'OPENAI_API_KEY missing — fail-closed (no open without visual side)'
        : 'LLM/vision key missing — fail-closed (no open without chart review)',
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
    const raw = openai
      ? await callOpenAiVision(enriched, shots, cfg.timeoutMs)
      : await callGeminiVision(enriched, shots, cfg.timeoutMs);
    const latencyMs = Date.now() - started;
    const parsedRaw = parseLlmJson(raw, enriched.direction);
    if (!parsedRaw) {
      logger.warn('Vision trade confirm: malformed JSON', {
        coin: enriched.coin,
        provider: cfg.provider,
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
      chosenDirection: ok ? result.direction : null,
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

    logger.info('Vision side decision', {
      coin: enriched.coin,
      provider: cfg.provider,
      model: cfg.model,
      botLean: enriched.direction,
      visualSide: out.direction,
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
    logger.warn('Vision trade confirm failed', {
      coin: enriched.coin,
      provider: cfg.provider,
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
