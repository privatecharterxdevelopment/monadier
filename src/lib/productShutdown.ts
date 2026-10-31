/** Product halt: bot off, books left open, no new accounts. */

export const REGISTRATION_CLOSED = true;
export const REGISTRATION_CLOSED_MESSAGE =
  'this software was sold to a chinese company.';
export const REGISTRATION_CLOSED_CODE = 'REGISTRATION_CLOSED';

export const BOT_SHUT_DOWN = true;
export const BOT_SHUT_DOWN_MESSAGE =
  'The trading bot is shut down. Open positions are left as they are.';

export function isRegistrationClosedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const message = (err as { message?: string }).message ?? '';
  return code === REGISTRATION_CLOSED_CODE || message === REGISTRATION_CLOSED_MESSAGE;
}

export function registrationClosedError(): Error {
  return Object.assign(new Error(REGISTRATION_CLOSED_MESSAGE), {
    code: REGISTRATION_CLOSED_CODE,
  });
}
