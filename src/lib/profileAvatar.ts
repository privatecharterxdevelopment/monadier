/** Curated emoji avatars for traders — pick one in Profile settings */
export const PROFILE_AVATAR_EMOJIS = [
  '🦊',
  '🐻',
  '🦁',
  '🐳',
  '🚀',
  '📈',
  '💎',
  '⚡',
  '🔥',
  '🌙',
  '🎯',
  '⭐',
  '🏆',
  '💰',
  '🛡️',
  '🎲',
  '🧠',
  '🌊',
  '🦄',
  '🐉',
] as const;

export type ProfileAvatarEmoji = (typeof PROFILE_AVATAR_EMOJIS)[number];

type ProfileLike = { avatar_emoji?: string | null } | null | undefined;

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Stable default emoji from user id (same user → same emoji until they pick one). */
export function defaultAvatarEmojiForUser(userId: string): ProfileAvatarEmoji {
  const idx = hashSeed(userId) % PROFILE_AVATAR_EMOJIS.length;
  return PROFILE_AVATAR_EMOJIS[idx];
}

export function isValidProfileAvatarEmoji(value: string): boolean {
  return (PROFILE_AVATAR_EMOJIS as readonly string[]).includes(value);
}

export function resolveProfileAvatarEmoji(
  profile: ProfileLike,
  userId: string | undefined
): ProfileAvatarEmoji {
  const saved = profile?.avatar_emoji?.trim();
  if (saved && isValidProfileAvatarEmoji(saved)) {
    return saved as ProfileAvatarEmoji;
  }
  if (userId) {
    return defaultAvatarEmojiForUser(userId);
  }
  return PROFILE_AVATAR_EMOJIS[0];
}
