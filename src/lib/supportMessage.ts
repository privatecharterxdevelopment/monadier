import { supabase } from './supabase';

export type SubmitSupportMessageInput = {
  subject: string;
  message: string;
};

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
    return { ok: false, error: error.message || 'Could not send message.' };
  }

  if (data?.error) {
    return { ok: false, error: String(data.error) };
  }

  return { ok: true };
}
