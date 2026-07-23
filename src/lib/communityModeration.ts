/**
 * Community content moderation — posts & comments only.
 * Blocks: profanity, emails, phones, DMs pitches, external ads/images/links
 * (HyperGain domains allowed), and off-topic promo spam.
 */

const PROFANITY = [
  'fuck',
  'fucker',
  'fucking',
  'shit',
  'bullshit',
  'asshole',
  'bitch',
  'bastard',
  'dick',
  'cock',
  'cunt',
  'slut',
  'whore',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'motherfucker',
  'scheisse',
  'scheiße',
  'arschloch',
  'hurensohn',
  'fotze',
  'wichser',
  'miststück',
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE =
  /(?:\+|00)?\d{1,3}[\s().-]?\d{2,4}[\s().-]?\d{3,4}[\s().-]?\d{3,4}|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const URL_RE = /https?:\/\/[^\s]+|www\.[^\s]+|(?:t\.me|telegram\.me|discord\.gg|wa\.me)\/[^\s]+/gi;
const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\([^)]+\)|<img\b[^>]*>/i;
const BASE64_IMAGE_RE = /data:image\//i;
const DM_PITCH_RE =
  /\b(dm me|pm me|direct message|whatsapp me|telegram me|call me|text me|schreib mir|schreibe mir)\b/i;
const EXTERNAL_PROMO_RE =
  /\b(join my (group|channel|signal)|guaranteed profit|copy my signals?|promo code|airdrop claim|seed phrase|private key)\b/i;

const ALLOWED_HOST_RE =
  /^(?:https?:\/\/)?(?:www\.)?(?:app\.)?hypergain\.io(?:\/|$)/i;

function stripUrls(text: string): string[] {
  const found: string[] = [];
  const matches = text.match(URL_RE);
  if (matches) found.push(...matches);
  return found;
}

function hasProfanity(text: string): boolean {
  const lower = text.toLowerCase();
  return PROFANITY.some((w) => {
    const re = new RegExp(`(?:^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z]|$)`, 'i');
    return re.test(lower);
  });
}

export type CommunityModerationResult =
  | { ok: true }
  | { ok: false; errorKey: string; error: string };

export function moderateCommunityText(
  raw: string,
  opts?: { field?: 'title' | 'body' | 'comment' }
): CommunityModerationResult {
  const text = raw.trim();
  const field = opts?.field ?? 'body';

  if (field === 'title' && (text.length < 3 || text.length > 120)) {
    return { ok: false, errorKey: 'community.errTitleLen', error: 'Title must be 3–120 characters.' };
  }
  if (field === 'body' && (text.length < 10 || text.length > 8000)) {
    return { ok: false, errorKey: 'community.errBodyLen', error: 'Post must be 10–8000 characters.' };
  }
  if (field === 'comment' && (text.length < 1 || text.length > 2000)) {
    return { ok: false, errorKey: 'community.errCommentLen', error: 'Comment must be 1–2000 characters.' };
  }

  if (hasProfanity(text)) {
    return {
      ok: false,
      errorKey: 'community.errProfanity',
      error: 'Please keep language clean — no swear words.',
    };
  }

  if (EMAIL_RE.test(text)) {
    return {
      ok: false,
      errorKey: 'community.errEmail',
      error: 'Do not share email addresses. Use posts and comments only.',
    };
  }

  if (PHONE_RE.test(text)) {
    return {
      ok: false,
      errorKey: 'community.errPhone',
      error: 'Do not share phone numbers. Use posts and comments only.',
    };
  }

  if (DM_PITCH_RE.test(text)) {
    return {
      ok: false,
      errorKey: 'community.errDm',
      error: 'No direct messages or off-platform contact requests.',
    };
  }

  if (MARKDOWN_IMAGE_RE.test(text) || BASE64_IMAGE_RE.test(text)) {
    return {
      ok: false,
      errorKey: 'community.errImages',
      error: 'No images or flyers — text only. HyperGain marketing stays on official channels.',
    };
  }

  if (EXTERNAL_PROMO_RE.test(text)) {
    return {
      ok: false,
      errorKey: 'community.errPromo',
      error: 'No external ads, signal groups, or non-HyperGain promotion.',
    };
  }

  for (const url of stripUrls(text)) {
    if (!ALLOWED_HOST_RE.test(url)) {
      return {
        ok: false,
        errorKey: 'community.errExternalLink',
        error: 'Only hypergain.io links are allowed. No external ads or flyers.',
      };
    }
  }

  return { ok: true };
}

export const COMMUNITY_CATEGORIES = [
  'bot_settings',
  'referrals',
  'crypto_bots',
  'betting',
  'help',
  'general',
] as const;

export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];
