import { useEffect, useRef } from 'react';
import { useDisconnect } from 'wagmi';
import { useAuth } from '../../contexts/AuthContext';
import { disableDemoMode } from '../../lib/demoMode';

const SIGNED_IN_EVENT = 'monadier:auth-signed-in';

/** Disconnect persisted wallet when auth user changes — prevents cross-account data bleed. */
export function emitAuthSignedIn() {
  window.dispatchEvent(new Event(SIGNED_IN_EVENT));
}

const AuthWalletReset: React.FC = () => {
  const { user } = useAuth();
  const { disconnect } = useDisconnect();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const uid = user?.id ?? null;

    if (prevUserIdRef.current === undefined) {
      prevUserIdRef.current = uid;
      return;
    }

    const prev = prevUserIdRef.current;
    if (prev !== uid) {
      // Switch accounts or sign out — not on first session restore (null → user).
      if (prev != null && uid != null && prev !== uid) {
        disableDemoMode();
        disconnect();
      } else if (prev != null && uid == null) {
        disableDemoMode();
        disconnect();
      }
    }

    prevUserIdRef.current = uid;
  }, [user?.id, disconnect]);

  return null;
};

export default AuthWalletReset;
