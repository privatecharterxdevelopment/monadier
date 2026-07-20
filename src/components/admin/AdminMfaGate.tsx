/**
 * Google Authenticator (TOTP) gate for admin panel.
 * Requires Supabase MFA AAL2 before admin data loads.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Props = {
  email: string;
  onVerified: () => void;
};

const AdminMfaGate: React.FC<Props> = ({ email, onVerified }) => {
  const [phase, setPhase] = useState<'loading' | 'enroll' | 'verify' | 'done'>('loading');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ensureAal2 = useCallback(async () => {
    setError('');
    setPhase('loading');
    const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr) {
      setError(aalErr.message);
      setPhase('verify');
      return;
    }
    if (aal.currentLevel === 'aal2') {
      setPhase('done');
      onVerified();
      return;
    }

    const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
    if (listErr) {
      setError(listErr.message);
      setPhase('verify');
      return;
    }
    const verified = factors.totp.find((f) => f.status === 'verified');
    if (verified) {
      setFactorId(verified.id);
      setPhase('verify');
      return;
    }

    // Drop unfinished enrollments so we don't stack unverified factors
    for (const f of factors.totp) {
      if (f.status !== 'verified') {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    // Enroll new TOTP (Google Authenticator / Authy)
    const { data: enrolled, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `HyperGain Admin (${email})`,
    });
    if (enrollErr || !enrolled) {
      setError(enrollErr?.message || 'Could not start authenticator setup');
      setPhase('verify');
      return;
    }
    setFactorId(enrolled.id);
    setQr(enrolled.totp.qr_code);
    setSecret(enrolled.totp.secret);
    setPhase('enroll');
  }, [email, onVerified]);

  useEffect(() => {
    void ensureAal2();
  }, [ensureAal2]);

  const submitCode = async () => {
    if (!factorId || code.trim().length < 6) {
      setError('Enter the 6-digit code from Google Authenticator');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (chErr || !challenge) throw chErr || new Error('Challenge failed');

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;

      setPhase('done');
      onVerified();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'done' || phase === 'loading') {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-muted animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-16 px-4 text-center space-y-4">
      <Shield className="w-12 h-12 mx-auto text-primary" aria-hidden />
      <h1 className="text-xl font-semibold text-primary">
        {phase === 'enroll' ? 'Set up Google Authenticator' : 'Authenticator code'}
      </h1>
      <p className="text-sm text-secondary">
        {phase === 'enroll'
          ? 'Scan the QR with Google Authenticator (or Authy), then enter the 6-digit code.'
          : 'Enter the 6-digit code from Google Authenticator to open the admin panel.'}
      </p>
      {phase === 'enroll' && qr ? (
        <div className="flex flex-col items-center gap-2">
          <img src={qr} alt="TOTP QR code" className="w-48 h-48 bg-white p-2 rounded" />
          {secret ? (
            <p className="text-xs text-secondary break-all">
              Manual key: <code>{secret}</code>
            </p>
          ) : null}
        </div>
      ) : null}
      <input
        className="term-profile-input w-full text-center tracking-widest text-lg"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        maxLength={8}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="button"
        className="hl-signin-google w-full"
        disabled={busy}
        onClick={() => void submitCode()}
      >
        {busy ? <Loader2 className="animate-spin inline" size={16} /> : null} Verify
      </button>
    </div>
  );
};

export default AdminMfaGate;
