import { supabase } from './supabase';

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
  userId: string,
  file: File
): Promise<string> {
  const err = validateAvatarFile(file);
  if (err) throw new Error(err);

  const ext = extForMime(file.type);
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;
  if (!publicUrl) throw new Error('Could not resolve avatar URL');

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: `${publicUrl}?t=${Date.now()}` })
    .eq('id', userId);

  if (profileError) throw profileError;

  return publicUrl;
}

export async function removeProfileAvatar(userId: string): Promise<void> {
  const { data: files } = await supabase.storage.from(BUCKET).list(userId);
  if (files?.length) {
    const paths = files.map((f) => `${userId}/${f.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
  }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId);

  if (error) throw error;
}
