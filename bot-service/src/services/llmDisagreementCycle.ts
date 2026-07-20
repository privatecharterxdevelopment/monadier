/**
 * Bot vs Gemini disagreement cycle.
 *
 * 1) First check: if they agree → proceed (caller applies shadow/enforce).
 * 2) If they disagree → do NOT trade; log llm_disagreement; wait for next closed candle.
 * 3) Re-check on fresh candle: bot peak rules + Gemini vision again.
 * 4) Only if both agree on re-check → shadow-log the agreed action (never auto-enforce from this path).
 *
 * Wait TF: LONG setups wait on 15m; SHORT setups wait on 5m (matches vision primary TFs).
 */
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { fetchPumpSweepAnalysis } from './pumpSweepAnalytics';
import { isPeakShortGrabPhase } from './peakShortLiquidity';
import {
  confirmTradeWithLlm,
  type LlmTradeConfirmInput,
  type LlmTradeConfirmResult,
  type LlmTradeVerdict,
} from './llmTradeConfirmGate';
import { recordHlOpenBlock } from './hlOpenBlocks';

export type BotPeakAssessment = {
  isPeak: boolean;
  phase: string;
  summary: string;
  direction: 'LONG' | 'SHORT';
};

export type LlmDisagreementPhase =
  | 'first_check_agree'
  | 'first_check_disagree'
  | 'awaiting_recheck'
  | 'recheck_agree_allow'
  | 'recheck_agree_peak_short'
  | 'recheck_still_disagree';

export type DisagreementCycleRecord = {
  evaluationId: string;
  walletAddress: string;
  coin: string;
  botDirection: 'LONG' | 'SHORT';
  botAssessment: BotPeakAssessment;
  geminiVerdict: LlmTradeVerdict;
  geminiDirection: 'LONG' | 'SHORT';
  geminiReason: string;
  geminiConfidence: number;
  waitTf: '5m' | '15m';
  /** Epoch ms when the forming candle at disagreement closes. */
  waitUntilMs: number;
  firstCheckAt: string;
  recheckAt?: string;
  phase: LlmDisagreementPhase;
  recheckBot?: BotPeakAssessment;
  recheckGemini?: {
    verdict: LlmTradeVerdict;
    direction: 'LONG' | 'SHORT';
    reason: string;
    confidence: number;
  };
};

const pendingByKey = new Map<string, DisagreementCycleRecord>();

function cycleKey(wallet: string, coin: string): string {
  return `${wallet.toLowerCase()}:${coin.toUpperCase()}`;
}

function candlePeriodMs(tf: '5m' | '15m'): number {
  return tf === '5m' ? 5 * 60_000 : 15 * 60_000;
}

/** End of the currently forming candle (= when next closed candle is available). */
export function nextCandleCloseMs(tf: '5m' | '15m', now = Date.now()): number {
  const period = candlePeriodMs(tf);
  return Math.floor(now / period) * period + period;
}

export function waitTfForDirection(direction: 'LONG' | 'SHORT'): '5m' | '15m' {
  return direction === 'SHORT' ? '5m' : '15m';
}

export async function assessBotPeak(
  coin: string,
  direction: 'LONG' | 'SHORT'
): Promise<BotPeakAssessment> {
  const analysis = await fetchPumpSweepAnalysis(coin);
  const phase = analysis?.phase ?? 'unknown';
  const isPeak = isPeakShortGrabPhase(phase);
  return {
    isPeak,
    phase,
    summary: analysis?.summary ?? `${coin} phase=${phase}`,
    direction,
  };
}

/**
 * Disagreement = Gemini blocks, or flips to the opposite side of the bot proposal.
 * Agreement = Gemini allow with same direction (hard apex flip against LONG counts as disagree).
 */
export function isBotGeminiDisagreement(
  botDirection: 'LONG' | 'SHORT',
  llm: LlmTradeConfirmResult
): boolean {
  if (llm.timedOut) return false; // fail-open, not a disagreement cycle
  if (llm.verdict === 'block') return true;
  if (llm.verdict === 'flip' && llm.direction !== botDirection) return true;
  if (llm.hardRuleApplied && llm.direction !== botDirection) return true;
  return false;
}

function logCycle(
  gate: 'llm_disagreement' | 'llm_confirm',
  cycle: DisagreementCycleRecord,
  extraReason: string
): void {
  const payload = {
    evaluation_id: cycle.evaluationId,
    phase: cycle.phase,
    waitTf: cycle.waitTf,
    waitUntilMs: cycle.waitUntilMs,
    bot: cycle.botAssessment,
    gemini: {
      verdict: cycle.geminiVerdict,
      direction: cycle.geminiDirection,
      reason: cycle.geminiReason,
      confidence: cycle.geminiConfidence,
    },
    recheckBot: cycle.recheckBot ?? null,
    recheckGemini: cycle.recheckGemini ?? null,
    note: extraReason,
  };
  const reason = `${extraReason} | ${JSON.stringify(payload)}`.slice(0, 2000);
  logger.info('LLM disagreement cycle', payload);
  void recordHlOpenBlock({
    walletAddress: cycle.walletAddress,
    coin: cycle.coin,
    direction: cycle.botDirection,
    gate,
    reason,
    confidence: cycle.geminiConfidence,
  });
}

export type DisagreementGateDecision =
  | {
      action: 'proceed';
      evaluationId: string;
      phase: LlmDisagreementPhase;
      llm: LlmTradeConfirmResult;
    }
  | {
      action: 'defer';
      evaluationId: string;
      phase: LlmDisagreementPhase;
      reason: string;
      waitUntilMs?: number;
    }
  | {
      /** Both agree peak→SHORT on re-check — shadow only, do not open. */
      action: 'shadow_peak_short';
      evaluationId: string;
      phase: LlmDisagreementPhase;
      reason: string;
    };

/**
 * Run first-check / pending re-check for one open attempt.
 * Forces disagreement-resolution actions to stay shadow (no live flip/open from this path).
 */
export async function resolveLlmDisagreementGate(opts: {
  walletAddress: string;
  coin: string;
  botDirection: 'LONG' | 'SHORT';
  llmInput: LlmTradeConfirmInput;
  llm: LlmTradeConfirmResult;
}): Promise<DisagreementGateDecision> {
  const coin = opts.coin.toUpperCase();
  const key = cycleKey(opts.walletAddress, coin);
  const pending = pendingByKey.get(key);
  const now = Date.now();

  // --- Pending cycle: wait or re-check ---
  if (pending && pending.phase === 'awaiting_recheck') {
    if (now < pending.waitUntilMs) {
      const secs = Math.ceil((pending.waitUntilMs - now) / 1000);
      return {
        action: 'defer',
        evaluationId: pending.evaluationId,
        phase: 'awaiting_recheck',
        reason: `LLM disagreement ${pending.evaluationId}: waiting for next closed ${pending.waitTf} candle (~${secs}s)`,
        waitUntilMs: pending.waitUntilMs,
      };
    }

    const recheckBot = await assessBotPeak(coin, pending.botDirection);
    const recheckLlm = await confirmTradeWithLlm({
      ...opts.llmInput,
      direction: pending.botDirection,
      pumpPhase: recheckBot.phase,
      pumpSummary: recheckBot.summary,
    });

    pending.recheckAt = new Date().toISOString();
    pending.recheckBot = recheckBot;
    pending.recheckGemini = {
      verdict: recheckLlm.verdict,
      direction: recheckLlm.direction,
      reason: recheckLlm.reason,
      confidence: recheckLlm.confidence,
    };

    const geminiSaysPeakShort =
      (recheckLlm.verdict === 'flip' && recheckLlm.direction === 'SHORT') ||
      (recheckLlm.hardRuleApplied && recheckLlm.direction === 'SHORT') ||
      (recheckBot.isPeak &&
        recheckLlm.verdict === 'allow' &&
        recheckLlm.direction === 'SHORT');

    const bothPeakShort = recheckBot.isPeak && geminiSaysPeakShort;
    const bothAllowSame =
      recheckLlm.verdict === 'allow' &&
      recheckLlm.direction === pending.botDirection &&
      !recheckLlm.hardRuleApplied;

    if (bothPeakShort) {
      pending.phase = 'recheck_agree_peak_short';
      pendingByKey.delete(key);
      logCycle(
        'llm_disagreement',
        pending,
        'SHADOW: re-check AGREE peak→SHORT — candidate logged only (not enforced)'
      );
      return {
        action: 'shadow_peak_short',
        evaluationId: pending.evaluationId,
        phase: 'recheck_agree_peak_short',
        reason: `SHADOW evaluation_id=${pending.evaluationId}: bot+Gemini agree peak→SHORT after ${pending.waitTf} candle — not opening (shadow-only resolution)`,
      };
    }

    if (bothAllowSame) {
      pending.phase = 'recheck_agree_allow';
      pendingByKey.delete(key);
      logCycle(
        'llm_disagreement',
        pending,
        'Re-check AGREE allow — proceeding with bot direction'
      );
      return {
        action: 'proceed',
        evaluationId: pending.evaluationId,
        phase: 'recheck_agree_allow',
        llm: {
          ...recheckLlm,
          // Disagreement-path resolution never flips live from this helper.
          enforce: false,
          shadow: true,
        },
      };
    }

    pending.phase = 'recheck_still_disagree';
    pendingByKey.delete(key);
    logCycle(
      'llm_disagreement',
      pending,
      'Re-check STILL DISAGREE — no trade'
    );
    return {
      action: 'defer',
      evaluationId: pending.evaluationId,
      phase: 'recheck_still_disagree',
      reason: `LLM disagreement ${pending.evaluationId}: re-check still disagree (bot peak=${recheckBot.isPeak}/${recheckBot.phase}, gemini ${recheckLlm.verdict}→${recheckLlm.direction}) — skip open`,
    };
  }

  // --- Fresh first check ---
  const botAssessment = await assessBotPeak(coin, opts.botDirection);
  const disagree = isBotGeminiDisagreement(opts.botDirection, opts.llm);

  if (!disagree) {
    const evaluationId = randomUUID();
    logCycle(
      'llm_confirm',
      {
        evaluationId,
        walletAddress: opts.walletAddress,
        coin,
        botDirection: opts.botDirection,
        botAssessment,
        geminiVerdict: opts.llm.verdict,
        geminiDirection: opts.llm.direction,
        geminiReason: opts.llm.reason,
        geminiConfidence: opts.llm.confidence,
        waitTf: waitTfForDirection(opts.botDirection),
        waitUntilMs: 0,
        firstCheckAt: new Date().toISOString(),
        phase: 'first_check_agree',
      },
      'First check AGREE — proceed'
    );
    return {
      action: 'proceed',
      evaluationId,
      phase: 'first_check_agree',
      llm: opts.llm,
    };
  }

  const waitTf = waitTfForDirection(opts.botDirection);
  const evaluationId = randomUUID();
  const cycle: DisagreementCycleRecord = {
    evaluationId,
    walletAddress: opts.walletAddress,
    coin,
    botDirection: opts.botDirection,
    botAssessment,
    geminiVerdict: opts.llm.verdict,
    geminiDirection: opts.llm.direction,
    geminiReason: opts.llm.reason,
    geminiConfidence: opts.llm.confidence,
    waitTf,
    waitUntilMs: nextCandleCloseMs(waitTf, now),
    firstCheckAt: new Date().toISOString(),
    phase: 'awaiting_recheck',
  };
  pendingByKey.set(key, cycle);
  logCycle(
    'llm_disagreement',
    cycle,
    `First check DISAGREE — defer until next closed ${waitTf} candle`
  );

  return {
    action: 'defer',
    evaluationId,
    phase: 'first_check_disagree',
    reason: `LLM disagreement ${evaluationId}: bot ${opts.botDirection} (peak=${botAssessment.isPeak}/${botAssessment.phase}) vs Gemini ${opts.llm.verdict}→${opts.llm.direction} — waiting next ${waitTf} close`,
    waitUntilMs: cycle.waitUntilMs,
  };
}

export function getPendingLlmDisagreement(
  walletAddress: string,
  coin: string
): DisagreementCycleRecord | undefined {
  return pendingByKey.get(cycleKey(walletAddress, coin));
}
