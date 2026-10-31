/**
 * Invite-only gate. When REGISTRATION_CLOSED is false, public signup is open.
 */
import { REGISTRATION_CLOSED, REGISTRATION_CLOSED_MESSAGE } from './productShutdown';

export const INVITE_ONLY_ENABLED = REGISTRATION_CLOSED;

export const INVITE_EMAILS = [] as const;

export function getInviteEmails(): string[] {
  return [...INVITE_EMAILS];
}

export function isInviteOnlyEnabled(): boolean {
  return REGISTRATION_CLOSED;
}

export function isInviteAllowedEmail(_email: string | undefined | null): boolean {
  if (!REGISTRATION_CLOSED) return true;
  return false;
}

export const INVITE_DENIED_MESSAGE = REGISTRATION_CLOSED_MESSAGE;
