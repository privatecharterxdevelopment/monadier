/** Username rules — must match DB `normalize_username`. */
export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export function normalizeUsernameInput(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const v = normalizeUsernameInput(raw);
  if (!v) return 'Username is required';
  if (!USERNAME_REGEX.test(v)) {
    return 'Use 3–20 characters: lowercase letters, numbers, underscore only';
  }
  return null;
}

export function displayHandle(profile: {
  username?: string | null;
  full_name?: string | null;
} | null | undefined, email?: string | null): string {
  const u = profile?.username?.trim();
  if (u) return u;
  const name = profile?.full_name?.trim();
  if (name) return name;
  if (email) return email.split('@')[0] || 'Trader';
  return 'Trader';
}
