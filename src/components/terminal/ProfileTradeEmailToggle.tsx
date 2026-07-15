import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { patchUserProfile } from '../../lib/profile';

const ProfileTradeEmailToggle: React.FC = () => {
  const { t } = useTranslation();
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
      setError(err instanceof Error ? err.message : t('profile.tradeEmail.saveFailed'));
    } finally {
      setBusy(false);
    }
  }, [user?.id, busy, enabled, refreshProfile, t]);

  const email = profile?.email || user?.email;
  const at = email ? t('profile.tradeEmail.atEmail', { email }) : '';

  return (
    <div id="profile-trade-email" className="term-profile-notify-email">
      <div className="term-profile-notify-email-row">
        <div>
          <p className="term-profile-notify-email-title">{t('profile.tradeEmail.title')}</p>
          <p className="term-profile-muted term-profile-notify-email-desc">
            {t('profile.tradeEmail.desc', { at })}
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
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : enabled ? (
            t('profile.tradeEmail.on')
          ) : (
            t('profile.tradeEmail.off')
          )}
        </button>
      </div>
      {error ? <p className="term-profile-err">{error}</p> : null}
    </div>
  );
};

export default ProfileTradeEmailToggle;
