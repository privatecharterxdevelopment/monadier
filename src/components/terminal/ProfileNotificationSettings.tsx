import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { patchUserProfile } from '../../lib/profile';
import HlFollowTradersPanel from './HlFollowTradersPanel';

type NotifyKey =
  | 'trade_close_email_enabled'
  | 'community_mention_email_enabled'
  | 'follow_trader_email_enabled';

const ProfileNotificationSettings: React.FC = () => {
  const { t } = useTranslation();
  const { user, profile, refreshProfile } = useAuth();
  const [tradeEnabled, setTradeEnabled] = useState(true);
  const [communityEnabled, setCommunityEnabled] = useState(true);
  const [followEnabled, setFollowEnabled] = useState(true);
  const [busyKey, setBusyKey] = useState<NotifyKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTradeEnabled(profile?.trade_close_email_enabled !== false);
  }, [profile?.trade_close_email_enabled]);

  useEffect(() => {
    setCommunityEnabled(profile?.community_mention_email_enabled !== false);
  }, [profile?.community_mention_email_enabled]);

  useEffect(() => {
    setFollowEnabled(profile?.follow_trader_email_enabled !== false);
  }, [profile?.follow_trader_email_enabled]);

  const valueFor = (key: NotifyKey) => {
    if (key === 'trade_close_email_enabled') return tradeEnabled;
    if (key === 'community_mention_email_enabled') return communityEnabled;
    return followEnabled;
  };

  const setValueFor = (key: NotifyKey, next: boolean) => {
    if (key === 'trade_close_email_enabled') setTradeEnabled(next);
    else if (key === 'community_mention_email_enabled') setCommunityEnabled(next);
    else setFollowEnabled(next);
  };

  const onToggle = useCallback(
    async (key: NotifyKey) => {
      if (!user?.id || busyKey) return;
      const current = valueFor(key);
      const next = !current;
      setBusyKey(key);
      setError(null);
      setValueFor(key, next);
      try {
        await patchUserProfile(user.id, { [key]: next });
        await refreshProfile();
      } catch (err) {
        setValueFor(key, !next);
        setError(err instanceof Error ? err.message : t('profile.notifications.saveFailed'));
      } finally {
        setBusyKey(null);
      }
    },
    [user?.id, busyKey, tradeEnabled, communityEnabled, followEnabled, refreshProfile, t]
  );

  const email = profile?.email || user?.email;
  const at = email ? t('profile.notifications.atEmail', { email }) : '';

  const renderToggle = (
    key: NotifyKey,
    enabled: boolean,
    titleKey: string,
    descKey: string,
    anchorId: string
  ) => (
    <div id={anchorId} className="term-profile-notify-email">
      <div className="term-profile-notify-email-row">
        <div>
          <p className="term-profile-notify-email-title">{t(titleKey)}</p>
          <p className="term-profile-muted term-profile-notify-email-desc">
            {t(descKey, { at })}
          </p>
        </div>
        <button
          type="button"
          className={`term-profile-toggle ${enabled ? 'term-profile-toggle--on' : ''}`}
          role="switch"
          aria-checked={enabled}
          disabled={Boolean(busyKey) || !user}
          onClick={() => void onToggle(key)}
        >
          {busyKey === key ? (
            <Loader2 size={14} className="animate-spin" />
          ) : enabled ? (
            t('profile.notifications.on')
          ) : (
            t('profile.notifications.off')
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="term-profile-notify-block">
      <p className="term-profile-notify-heading">{t('profile.notifications.heading')}</p>
      {renderToggle(
        'trade_close_email_enabled',
        tradeEnabled,
        'profile.notifications.tradeTitle',
        'profile.notifications.tradeDesc',
        'profile-trade-email'
      )}
      {renderToggle(
        'community_mention_email_enabled',
        communityEnabled,
        'profile.notifications.communityTitle',
        'profile.notifications.communityDesc',
        'profile-community-email'
      )}
      {renderToggle(
        'follow_trader_email_enabled',
        followEnabled,
        'profile.notifications.followEmailTitle',
        'profile.notifications.followEmailDesc',
        'profile-follow-email'
      )}
      <HlFollowTradersPanel />
      {error ? <p className="term-profile-err">{error}</p> : null}
    </div>
  );
};

export default ProfileNotificationSettings;
