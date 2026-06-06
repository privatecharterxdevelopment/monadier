import { supabase, ensureUserProfile } from './supabase';
import { patchUserProfile } from './profile';
import type { User } from '@supabase/supabase-js';

const BUCKET = 'avatars';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

export function validateAvatarFile(file: File): string | null {
  if (!ALLOWED.has(file.type)) {
    return 'Use JPEG, PNG, WebP, or GIF';
  }
  if (file.size > MAX_BYTES) {
    return 'Image must be 2 MB or smaller';
  }
  return null;
}

export async function uploadProfileAvatar(
  user: User,
  file: File
): Promise<string> {
  const err = validateAvatarFile(file);
  if (err) throw new Error(err);

  await ensureUserProfile(user);
  const userId = user.id;

  const ext = extForMime(file.type);
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });

  if (uploadError) {
    throw new Error(
      uploadError.message.includes('Bucket not found')
        ? 'Avatar storage is not set up on Supabase. Run migration 20260605100000_profile_avatars_storage.sql (supabase db push).'
        : uploadError.message
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;
  if (!publicUrl) throw new Error('Could not resolve avatar URL');

  await patchUserProfile(userId, { avatar_url: `${publicUrl}?t=${Date.now()}` });

  return publicUrl;
}

export async function removeProfileAvatar(user: User): Promise<void> {
  await ensureUserProfile(user);
  const userId = user.id;

  const { data: files } = await supabase.storage.from(BUCKET).list(userId);
  if (files?.length) {
    const paths = files.map((f) => `${userId}/${f.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
  }

  await patchUserProfile(userId, { avatar_url: null });
}
