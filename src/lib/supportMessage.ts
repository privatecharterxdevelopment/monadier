import { supabase } from './supabase';

export type SubmitSupportMessageInput = {
  subject: string;
  message: string;
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

export async function submitSupportMessage(
  input: SubmitSupportMessageInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const subject = input.subject.trim();
  const message = input.message.trim();

  if (subject.length < 3) {
    return { ok: false, error: 'Subject must be at least 3 characters.' };
  }
  if (message.length < 10) {
    return { ok: false, error: 'Message must be at least 10 characters.' };
  }

  const { data, error } = await supabase.functions.invoke('send-support-message', {
    body: { subject, message },
  });

  if (error) {
    return { ok: false, error: await readInvokeErrorMessage(error) };
  }

  if (data?.error) {
    return { ok: false, error: String(data.error) };
  }

  return { ok: true };
}
