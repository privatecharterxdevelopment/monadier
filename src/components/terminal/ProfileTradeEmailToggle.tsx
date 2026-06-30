import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { patchUserProfile } from '../../lib/profile';

const ProfileTradeEmailToggle: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const val = profile?.trade_close_email_enabled;
    setEnabled(val !== false);
  }, [profile?.trade_close_email_enabled]);

  const onToggle = useCallback(async () => {
    if (!user?.id || busy) return;
    const next = !enabled;
    setBusy(true);
    setError(null);
    setEnabled(next);
    try {
      await patchUserProfile(user.id, { trade_close_email_enabled: next });
      await refreshProfile();
    } catch (err) {
      setEnabled(!next);
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }, [user?.id, busy, enabled, refreshProfile]);

  const email = profile?.email || user?.email;

  return (
    <div id="profile-trade-email" className="term-profile-notify-email">
      <div className="term-profile-notify-email-row">
        <div>
          <p className="term-profile-notify-email-title">Trade close emails</p>
          <p className="term-profile-muted term-profile-notify-email-desc">
            Get an email for every closed trade with P/L and ROI
            {email ? ` at ${email}` : ''}.
          </p>
        </div>
        <button
          type="button"
          className={`term-profile-toggle ${enabled ? 'term-profile-toggle--on' : ''}`}
          role="switch"
          aria-checked={enabled}
          disabled={busy || !user}
          onClick={() => void onToggle()}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : enabled ? 'On' : 'Off'}
        </button>
      </div>
      {error ? <p className="term-profile-err">{error}</p> : null}
    </div>
  );
};

export default ProfileTradeEmailToggle;
