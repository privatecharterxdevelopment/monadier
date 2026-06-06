import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Loader2 } from 'lucide-react';
import { consumeAuthToast } from '../../lib/authToast';

type ToastState = {
  message: string;
  loading?: boolean;
};

type TermAuthToastContextValue = {
  showToast: (message: string, durationMs?: number) => void;
  signOutWithToast: (signOutFn: () => Promise<void>, redirect: () => void) => Promise<void>;
};

const TermAuthToastContext = createContext<TermAuthToastContextValue | null>(null);

export function useTermAuthToast(): TermAuthToastContextValue {
  const ctx = useContext(TermAuthToastContext);
  if (!ctx) {
    throw new Error('useTermAuthToast must be used within TermAuthToastProvider');
  }
  return ctx;
}

export const TermAuthToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consumedLoginRef = useRef(false);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const showToast = useCallback((message: string, durationMs = 2600) => {
    clearHideTimer();
    setToast({ message, loading: false });
    hideTimerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  const signOutWithToast = useCallback(
    async (signOutFn: () => Promise<void>, redirect: () => void) => {
      clearHideTimer();
      setToast({ message: 'Signing out…', loading: true });
      try {
        await signOutFn();
        setToast({ message: 'Successfully signed out', loading: false });
        hideTimerRef.current = setTimeout(() => {
          setToast(null);
          redirect();
        }, 1400);
      } catch {
        setToast({ message: 'Sign out failed — try again', loading: false });
        hideTimerRef.current = setTimeout(() => setToast(null), 3200);
      }
    },
    []
  );

  useEffect(() => {
    if (consumedLoginRef.current) return;
    consumedLoginRef.current = true;
    const kind = consumeAuthToast();
    if (kind === 'signed_in') {
      showToast('Signed in successfully', 2800);
    }
  }, [showToast]);

  useEffect(() => () => clearHideTimer(), []);

  return (
    <TermAuthToastContext.Provider value={{ showToast, signOutWithToast }}>
      {children}
      {toast && (
        <div className="term-auth-toast-wrap" role="status" aria-live="polite">
          <div className="term-auth-toast">
            {toast.loading && <Loader2 size={14} className="term-auth-toast-spinner" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </TermAuthToastContext.Provider>
  );
};
