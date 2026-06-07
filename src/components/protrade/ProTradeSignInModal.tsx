import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { signIn, signInWithGoogle } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTermAuthToast } from '../terminal/TermAuthToast';

type Props = {
  open: boolean;
  onClose: () => void;
  reason?: string;
  onSwitchToRegister?: () => void;
  /** Parent supplies backdrop — avoids double overlay when switching sign in ↔ register */
  embedded?: boolean;
};

const ProTradeSignInModal: React.FC<Props> = ({
  open,
  onClose,
  reason,
  onSwitchToRegister,
  embedded = false,
}) => {
  const { user } = useAuth();
  const { showToast } = useTermAuthToast();
  const closedForUserRef = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      closedForUserRef.current = false;
      return;
    }
    if (!user || closedForUserRef.current) return;
    closedForUserRef.current = true;
    showToast('Signed in successfully', 2800);
    onClose();
  }, [open, user, onClose, showToast]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) throw signInError;
      showToast('Signed in successfully', 2800);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sign in';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    try {
      const { error: oauthError } = await signInWithGoogle();
      if (oauthError) throw oauthError;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sign in with Google';
      setError(msg);
    }
  };

  const dialog = (
    <div
      className="hl-modal hl-modal--sm hl-signin-modal"
      role="dialog"
      aria-labelledby="hl-signin-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="hl-modal-head">
        <div>
          <h2 id="hl-signin-title" className="hl-modal-title">
            Sign in
          </h2>
          {reason ? <p className="hl-signin-reason">{reason}</p> : null}
        </div>
        <button type="button" className="hl-modal-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {error ? <p className="hl-signin-error">{error}</p> : null}

      <form className="hl-signin-form" onSubmit={handleSubmit}>
        <label className="term-profile-label" htmlFor="hl-signin-email">
          Email
        </label>
        <input
          id="hl-signin-email"
          className="term-profile-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="term-profile-label" htmlFor="hl-signin-password">
          Password
        </label>
        <input
          id="hl-signin-password"
          className="term-profile-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit" className="term-modal-primary hl-signin-submit" disabled={isLoading}>
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Sign in'}
        </button>
      </form>

      <div className="hl-signin-divider">
        <span>or</span>
      </div>

      <button type="button" className="hl-signin-google" onClick={handleGoogle}>
        Continue with Google
      </button>

      <p className="hl-signin-foot">
        New here?{' '}
        <button type="button" className="hl-signin-link-btn" onClick={onSwitchToRegister}>
          Register now
        </button>
      </p>
    </div>
  );

  if (embedded) return dialog;

  return (
    <div className="hl-modal-backdrop" role="presentation" onClick={onClose}>
      {dialog}
    </div>
  );
};

export default ProTradeSignInModal;
