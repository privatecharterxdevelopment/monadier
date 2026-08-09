import type { HlOutcomeMarket, HlOutcomeQuestion, OutcomeSideIndex } from './types';

export type PriceBinaryMeta = {
  underlying: string;
  targetPrice: number | null;
  expiry: string;
  period: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parsePipeMeta(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split('|')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

export function parsePriceBinaryMeta(raw?: string | null): PriceBinaryMeta | null {
  if (!raw || !raw.toLowerCase().includes('pricebinary')) return null;
  const parts = parsePipeMeta(raw);
  const targetRaw = parts.targetPrice;
  const targetPrice =
    targetRaw != null && targetRaw !== '' && Number.isFinite(Number(targetRaw))
      ? Number(targetRaw)
      : null;
  return {
    underlying: parts.underlying ?? 'Crypto',
    targetPrice,
    expiry: parts.expiry ?? '',
    period: parts.period ?? '',
  };
}

function formatExpiryLabel(expiry: string): string {
  const m = expiry.match(/^(\d{4})(\d{2})(\d{2})(?:-(\d{2})(\d{2}))?/);
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return '';
  const day = Number(m[3]);
  // Midnight (00:00) — show date only. "00:00 UTC" was reading as "0.00UTC" on cards.
  const hasTime = m[4] != null && m[5] != null;
  const isMidnight = hasTime && m[4] === '00' && m[5] === '00';
  const time = hasTime && !isMidnight ? ` ${m[4]}:${m[5]} UTC` : '';
  return `${day} ${month}${time}`;
}

function formatPeriodLabel(period: string): string {
  if (!period) return '';
  if (period === '1d') return 'Daily';
  if (period.endsWith('d')) return `${period.slice(0, -1)}-day`;
  if (period.endsWith('h')) return `${period.slice(0, -1)}h`;
  return period;
}

function formatTargetUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatPriceBinaryTitle(meta: PriceBinaryMeta): string {
  const target = meta.targetPrice != null ? formatTargetUsd(meta.targetPrice) : '';
  const expiry = formatExpiryLabel(meta.expiry);
  const period = formatPeriodLabel(meta.period);
  const chunks = [`${meta.underlying} above ${target || 'target'}`];
  if (period) chunks.push(period);
  if (expiry) chunks.push(`exp ${expiry.trim()}`);
  return chunks.filter(Boolean).join(' · ');
}

export function formatPriceBinarySummary(meta: PriceBinaryMeta): string {
  const target = meta.targetPrice != null ? formatTargetUsd(meta.targetPrice) : 'the target';
  const expiry = formatExpiryLabel(meta.expiry);
  const period = formatPeriodLabel(meta.period);
  const when = expiry ? ` at ${expiry.trim()}` : '';
  const cadence = period ? `${period.toLowerCase()} market — ` : '';
  return `${cadence}Resolves Yes if ${meta.underlying} is above ${target}${when}.`;
}

export function findPriceBinaryMeta(question: HlOutcomeQuestion): PriceBinaryMeta | null {
  return (
    parsePriceBinaryMeta(question.description) ??
    question.legs.map((leg) => parsePriceBinaryMeta(leg.description)).find((m) => m != null) ??
    null
  );
}

export function isRawPipeDescription(text: string): boolean {
  return (
    text.includes('class:priceBinary') ||
    text.includes('metadata=') ||
    /^\w+:[^|]+(\|[^|]+)+$/.test(text.trim())
  );
}

export function formatBettingQuestionTitle(question: HlOutcomeQuestion): string {
  const meta = findPriceBinaryMeta(question);
  if (meta) return formatPriceBinaryTitle(meta);
  if (question.name && !isRawPipeDescription(question.name) && question.name !== 'Recurring') {
    return question.name;
  }
  return question.name || 'Market';
}

export function formatBettingQuestionSummary(question: HlOutcomeQuestion): string {
  const meta = findPriceBinaryMeta(question);
  if (meta) return formatPriceBinarySummary(meta);

  const desc = typeof question.description === 'string' ? question.description.trim() : '';
  if (!desc || isRawPipeDescription(desc)) return '';

  const firstLine = desc.split('\n')[0]?.trim() ?? '';
  if (firstLine.length < 220) return firstLine;
  return desc.slice(0, 220).trim() + '…';
}

export function formatBettingLegName(leg: HlOutcomeMarket): string {
  const meta = parsePriceBinaryMeta(leg.description);
  if (meta?.targetPrice != null) {
    return `${meta.underlying} above ${formatTargetUsd(meta.targetPrice)}`;
  }
  if (meta) return `${meta.underlying} price target`;
  if (leg.name === 'Recurring' || leg.name === 'Fallback') {
    return leg.yesLabel === 'Yes' ? 'Yes outcome' : leg.name;
  }
  return leg.name;
}

export function formatBettingMarketName(market: HlOutcomeMarket): string {
  return formatBettingLegName(market);
}

export type BettingOrderPickDisplay = {
  eventTitle: string;
  sideLabel: string;
  legName: string;
  expiry: string | null;
};

/** Order-slip headline: event + "Yes on Argentina" style pick (not bare "Yes" / "Argentina"). */
export function formatBettingOrderPickDisplay(
  question: HlOutcomeQuestion | null | undefined,
  market: HlOutcomeMarket,
  side: OutcomeSideIndex
): BettingOrderPickDisplay {
  const sideLabel = side === 0 ? market.yesLabel : market.noLabel;
  const legName = formatBettingLegName(market);
  const eventTitle = question ? formatBettingQuestionTitle(question) : 'Market';

  return {
    eventTitle,
    sideLabel,
    legName,
    expiry: formatBettingMarketExpirySubtitle(market),
  };
}

/** Period + resolution time for order slip (e.g. Daily · Until 21 Jun 06:00 UTC). */
export function formatBettingMarketExpirySubtitle(market: HlOutcomeMarket): string | null {
  const meta = parsePriceBinaryMeta(market.description);
  if (!meta) return null;
  const period = formatPeriodLabel(meta.period);
  const expiry = formatExpiryLabel(meta.expiry);
  if (!period && !expiry) return null;
  const chunks: string[] = [];
  if (period) chunks.push(period);
  if (expiry) chunks.push(`Until ${expiry.trim()}`);
  return chunks.join(' · ');
}
