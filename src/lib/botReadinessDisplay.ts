import type { BotReadiness } from './botReadiness';
import { isActionableBotScanDetail, isBotScanNoiseDetail } from './hlBotReasonLabels';

function scrubHeadline(headline: string): string {
  const h = headline.trim();
  if (!h) return '';
  if (isBotScanNoiseDetail(h)) return 'Bot is reading market…';
  if (/^Slot \d+/i.test(h)) return 'Bot is reading market…';
  if (/% — |6×1m|next3 (UP|DOWN)/i.test(h)) return 'Bot is reading market…';
  if (/Waiting for \d+m/i.test(h)) return 'Bot is reading market…';
  if (/\bSHORT \d+%|\bLONG \d+%/i.test(h) && /—/.test(h)) return 'Bot is reading market…';
  return h;
}

/** Strip scan/engine chatter from readiness copy shown in the dock analyzer. */
export function scrubBotReadinessForUi(readiness: BotReadiness): BotReadiness {
  const d = readiness.detail?.trim() ?? '';
  const headline = scrubHeadline(readiness.headline ?? '');
  if (!d || !isActionableBotScanDetail(d) || isBotScanNoiseDetail(d)) {
    return { ...readiness, headline, detail: '' };
  }
  return { ...readiness, headline, detail: d };
}