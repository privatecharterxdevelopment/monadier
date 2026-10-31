/** Product halt switches — keep false for live HyperGain (registration + bot). */

export const REGISTRATION_CLOSED = false;
export const REGISTRATION_CLOSED_MESSAGE =
  'Registration is temporarily closed.';
export const REGISTRATION_CLOSED_CODE = 'REGISTRATION_CLOSED';

export const BOT_SHUT_DOWN = false;
export const BOT_SHUT_DOWN_MESSAGE =
  'The trading bot is temporarily shut down. Open positions are left as they are.';

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
