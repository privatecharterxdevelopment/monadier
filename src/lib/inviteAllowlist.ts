/**
 * Public registration is closed. Existing accounts can still sign in.
 */
import { REGISTRATION_CLOSED, REGISTRATION_CLOSED_MESSAGE } from './productShutdown';

export const INVITE_ONLY_ENABLED = REGISTRATION_CLOSED;

export const INVITE_EMAILS = [] as const;

export function getInviteEmails(): string[] {
  return [];
}

export function isInviteOnlyEnabled(): boolean {
  return REGISTRATION_CLOSED;
}

export function isInviteAllowedEmail(_email: string | undefined | null): boolean {
  return false;
}

export const INVITE_DENIED_MESSAGE = REGISTRATION_CLOSED_MESSAGE;
