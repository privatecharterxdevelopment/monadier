import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext';
import { acceptUserLegalTerms, fetchLegalAcceptance } from '../lib/legalAcceptance';

type LegalAcceptanceContextValue = {
  /** null while loading for signed-in users */
  accepted: boolean | null;
  /** Runs action immediately when accepted; otherwise opens modal first */
  ensureAccepted: (action: () => void | Promise<void>) => void;
  refresh: () => Promise<void>;
};

const LegalAcceptanceContext = createContext<LegalAcceptanceContextValue | null>(null);

export function LegalAcceptanceProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isDemoUser } = useAuth();
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<(() => void | Promise<void>) | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || isDemoUser || !user?.id) {
      setAccepted(true);
      return;
    }
    setAccepted(null);
    try {
      const state = await fetchLegalAcceptance(user.id);
      setAccepted(state.accepted);
    } catch {
      setAccepted(false);
    }
  }, [isAuthenticated, isDemoUser, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ensureAccepted = useCallback(
    (action: () => void | Promise<void>) => {
      if (isDemoUser || !isAuthenticated) {
        void action();
        return;
      }
      if (accepted) {
        void action();
        return;
      }
      pendingRef.current = action;
      setTermsChecked(false);
      setPrivacyChecked(false);
      setError(null);
      setOpen(true);
    },
    [accepted, isAuthenticated, isDemoUser]
  );

  const close = () => {
    if (busy) return;
    setOpen(false);
    pendingRef.current = null;
  };

  const handleAccept = async () => {
    if (!termsChecked || !privacyChecked) {
      setError('Please accept both Terms of Service and Privacy Policy to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptUserLegalTerms();
      setAccepted(true);
      setOpen(false);
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next) await next();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save acceptance');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LegalAcceptanceContext.Provider value={{ accepted, ensureAccepted, refresh }}>
      {children}
      {open ? (
        <div className="hl-modal-backdrop" role="presentation" onClick={close}>
          <div
            className="hl-modal hl-modal--legal"
            role="dialog"
            aria-labelledby="legal-accept-title"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="legal-accept-title" className="hl-modal-title">
              Before you trade
            </h2>
            <p className="hl-modal-sub">
              HyperGain is non-custodial trading software on Hyperliquid. Confirm you have read and
              agree to our legal documents before placing trades or starting the bot.
            </p>
            <label className="hl-legal-check">
              <input
                type="checkbox"
                checked={termsChecked}
                onChange={(e) => setTermsChecked(e.target.checked)}
              />
              <span>
                I accept the{' '}
                <Link to="/terms" target="_blank" rel="noopener noreferrer">
                  Terms of Service
                </Link>
              </span>
            </label>
            <label className="hl-legal-check">
              <input
                type="checkbox"
                checked={privacyChecked}
                onChange={(e) => setPrivacyChecked(e.target.checked)}
              />
              <span>
                I accept the{' '}
                <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </Link>
              </span>
            </label>
            {error ? <p className="hl-modal-error">{error}</p> : null}
            <div className="hl-modal-actions">
              <button type="button" className="hl-btn hl-btn--ghost" disabled={busy} onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="hl-btn hl-btn--primary"
                disabled={busy || !termsChecked || !privacyChecked}
                onClick={() => void handleAccept()}
              >
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
                Accept &amp; continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </LegalAcceptanceContext.Provider>
  );
}

export function useLegalAcceptance(): LegalAcceptanceContextValue {
  const ctx = useContext(LegalAcceptanceContext);
  if (!ctx) {
    throw new Error('useLegalAcceptance must be used within LegalAcceptanceProvider');
  }
  return ctx;
}
