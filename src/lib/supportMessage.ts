import { supabase } from './supabase';

export type SubmitSupportMessageInput = {
  subject: string;
  message: string;
  channel?: 'form' | 'chat';
};

async function readInvokeErrorMessage(error: unknown): Promise<string> {
  const fallback =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message || 'Could not send message.')
      : 'Could not send message.';

  const ctx =
    error && typeof error === 'object' && 'context' in error
      ? (error as { context?: Response }).context
      : undefined;
  if (!ctx || typeof ctx.json !== 'function') return fallback;

  try {
    const body = (await ctx.json()) as { error?: string } | null;
    if (body?.error) return String(body.error);
  } catch {
    /* ignore parse failures */
  }
  return fallback;
}

async function accessTokenForFunctions(): Promise<string | null> {
  // Validate with Auth (refreshes when possible) before invoking edge functions.
  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? null;
  }

  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const expiresAtMs = (sess.session?.expires_at ?? 0) * 1000;
  if (token && expiresAtMs > Date.now() + 60_000) return token;

  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed.session?.access_token ?? null;
}

export async function submitSupportMessage(
  input: SubmitSupportMessageInput
): Promise<{ ok: true; ticketId: string | null } | { ok: false; error: string }> {
  const subject = input.subject.trim();
  const message = input.message.trim();
  const channel = input.channel === 'chat' ? 'chat' : 'form';

  if (subject.length < 3) {
    return { ok: false, error: 'Subject must be at least 3 characters.' };
  }
  if (channel === 'chat') {
    if (message.length < 1) {
      return { ok: false, error: 'Message cannot be empty.' };
    }
  } else if (message.length < 10) {
    return { ok: false, error: 'Message must be at least 10 characters.' };
  }

  const accessToken = await accessTokenForFunctions();
  if (!accessToken) {
    return { ok: false, error: 'Please sign in again to use live chat.' };
  }

  const { data, error } = await supabase.functions.invoke('send-support-message', {
    body: { subject, message, channel },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    const msg = await readInvokeErrorMessage(error);
    if (/invalid or expired token/i.test(msg)) {
      return { ok: false, error: 'Please sign in again to use live chat.' };
    }
    return { ok: false, error: msg };
  }

  if (data?.error) {
    const msg = String(data.error);
    if (/invalid or expired token/i.test(msg)) {
      return { ok: false, error: 'Please sign in again to use live chat.' };
    }
    return { ok: false, error: msg };
  }

  return {
    ok: true,
    ticketId: typeof data?.ticketId === 'string' ? data.ticketId : null,
  };
}
