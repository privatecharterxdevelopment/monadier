import React, { useEffect, useRef, useState } from 'react';
import {
  Save,
  CheckCircle,
  AlertCircle,
  Loader2,
  Plus,
  X,
  Upload,
  ImageIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ProfileSecurityPanel from './ProfileSecurityPanel';
import ProfileNotificationSettings from './ProfileNotificationSettings';
import ProfileLoginHistoryPanel from './ProfileLoginHistoryPanel';
import ProfileBettingPanel from './ProfileBettingPanel';
import { useAuth } from '../../contexts/AuthContext';
import ProfileAvatar from '../profile/ProfileAvatar';
import {
  PROFILE_AVATAR_EMOJIS,
  defaultAvatarEmojiForUser,
  isValidProfileAvatarEmoji,
} from '../../lib/profileAvatar';
import { uploadProfileAvatar, removeProfileAvatar } from '../../lib/profileAvatarUpload';
import {
  supabase,
  updateUserProfile,
  ensureUserProfile,
  isUsernameAvailable,
  setUsernameOnce,
} from '../../lib/supabase';
import { validateUsername, normalizeUsernameInput } from '../../lib/username';

function isValidAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export type ProfilePanelSection = 'identity' | 'security' | 'wallets' | 'betting' | 'history' | 'all';

type Props = {
  activeSection?: ProfilePanelSection;
  variant?: 'terminal' | 'pro';
};

const TerminalProfilePanel: React.FC<Props> = ({
  activeSection = 'all',
  variant = 'terminal',
}) => {
  const { t } = useTranslation();
  const { user, profile, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [usernameInput, setUsernameInput] = useState('');
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const hasUsername = Boolean(profile?.username?.trim());
  const [avatarEmoji, setAvatarEmoji] = useState('🙂');
  const [linkedWallets, setLinkedWallets] = useState<string[]>([]);
  const [newWalletInput, setNewWalletInput] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    void ensureUserProfile(user).catch((e) => {
      console.error('[Profile] ensureUserProfile', e);
    });
  }, [user]);

  useEffect(() => {
    if (profile) {
      setUsernameInput(profile.username || '');
      setFullName(profile.full_name || '');
      setCountry(profile.country || '');
      const saved = profile.avatar_emoji?.trim();
      if (saved && isValidProfileAvatarEmoji(saved)) {
        setAvatarEmoji(saved);
      } else if (user?.id) {
        setAvatarEmoji(defaultAvatarEmojiForUser(user.id));
      }
    }
  }, [profile, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('user_wallets')
        .select('wallet_address')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (data) setLinkedWallets(data.map((w) => w.wallet_address));
    })();
  }, [user?.id]);

  const handleSaveProfile = async () => {
    if (!user?.id || !fullName.trim() || !country.trim()) {
      setProfileSaveError(t('profile.identity.nameCountryRequired'));
      return;
    }
    setIsSavingProfile(true);
    setProfileSaveError(null);
    try {
      await ensureUserProfile(user);

      if (!hasUsername) {
        const uErr = validateUsername(usernameInput);
        if (uErr) {
          setProfileSaveError(uErr);
          return;
        }
        const available = await isUsernameAvailable(usernameInput);
        if (!available) {
          setProfileSaveError(t('profile.identity.usernameTaken'));
          return;
        }
        await setUsernameOnce(usernameInput);
      }

      const { error } = await updateUserProfile(user.id, {
        full_name: fullName.trim(),
        country: country.trim(),
        avatar_emoji: avatarEmoji || null,
      });
      if (error) throw error;
      setProfileSaveSuccess(true);
      setTimeout(() => setProfileSaveSuccess(false), 3000);
      await refreshProfile();
    } catch (err: unknown) {
      setProfileSaveError(err instanceof Error ? err.message : t('profile.identity.saveFailed'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleEmojiPick = async (emoji: string) => {
    setAvatarEmoji(emoji);
    if (!user?.id || profile?.avatar_url?.trim()) return;
    try {
      await ensureUserProfile(user);
      const { error } = await updateUserProfile(user.id, { avatar_emoji: emoji });
      if (error) throw error;
      await refreshProfile();
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : t('profile.identity.emojiFailed'));
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.id) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await uploadProfileAvatar(user, file);
      await refreshProfile();
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : t('profile.identity.uploadFailed'));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await removeProfileAvatar(user);
      await refreshProfile();
      setAvatarSuccess(true);
      setTimeout(() => setAvatarSuccess(false), 4000);
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : t('profile.identity.removeFailed'));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAddWallet = async () => {
    if (!user?.id) return;
    const addr = newWalletInput.trim().toLowerCase();
    if (!isValidAddress(addr)) {
      setWalletError(t('profile.wallets.invalidAddress'));
      return;
    }
    if (linkedWallets.includes(addr)) {
      setWalletError(t('profile.wallets.alreadyLinked'));
      return;
    }
    setWalletBusy(true);
    setWalletError(null);
    try {
      const { error } = await supabase.from('user_wallets').insert({
        user_id: user.id,
        wallet_address: addr,
      });
      if (error) throw error;
      setLinkedWallets((prev) => [...prev, addr]);
      setNewWalletInput('');
    } catch (err: unknown) {
      setWalletError(err instanceof Error ? err.message : t('profile.wallets.addFailed'));
    } finally {
      setWalletBusy(false);
    }
  };

  const handleRemoveWallet = async (wallet: string) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('user_wallets')
        .delete()
        .eq('user_id', user.id)
        .eq('wallet_address', wallet.toLowerCase());
      if (error) throw error;
      setLinkedWallets((prev) => prev.filter((w) => w !== wallet.toLowerCase()));
    } catch (err: unknown) {
      setWalletError(err instanceof Error ? err.message : t('profile.wallets.removeFailed'));
    }
  };

  const hasPhoto = Boolean(profile?.avatar_url?.trim());

  const show = (section: ProfilePanelSection) =>
    activeSection === 'all' || activeSection === section;
  const isPro = variant === 'pro';
  const layoutClass = isPro
    ? 'term-profile-layout term-profile-layout--pro'
    : 'term-profile-layout term-profile-layout--grid';

  return (
    <div
      className={`term-profile-page term-profile-page--compact ${isPro ? 'term-profile-page--pro' : ''}`}
    >
      <div className={layoutClass}>
        {show('identity') ? (
        <section id="profile-identity" className="term-profile-card term-profile-card--section">
          {isPro ? <h2 className="term-profile-card-title">{t('profile.detailsTitle')}</h2> : null}
          <div className="term-profile-avatar-row">
            <ProfileAvatar profile={profile} userId={user?.id} size="md" />
            <div className="term-profile-avatar-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={handleAvatarUpload}
              />
              <button
                type="button"
                className="term-btn-sm"
                disabled={avatarBusy}
                onClick={() => fileRef.current?.click()}
              >
                {avatarBusy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                {t('profile.identity.uploadLogo')}
              </button>
              {hasPhoto && (
                <button
                  type="button"
                  className="term-btn-sm"
                  disabled={avatarBusy}
                  onClick={handleRemoveAvatar}
                >
                  <ImageIcon size={14} />
                  {t('profile.identity.removePhoto')}
                </button>
              )}
            </div>
          </div>
          {avatarSuccess && (
            <p className="term-profile-ok">
              <CheckCircle size={14} /> {t('profile.identity.photoSaved')}
            </p>
          )}
          {avatarError && (
            <p className="term-profile-err">
              <AlertCircle size={14} /> {avatarError}
            </p>
          )}
          {!hasPhoto && (
            <div className="term-profile-emoji-row">
              {PROFILE_AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`term-profile-emoji ${avatarEmoji === emoji ? 'term-profile-emoji--on' : ''}`}
                  onClick={() => void handleEmojiPick(emoji)}
                  aria-pressed={avatarEmoji === emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <label className="term-profile-label">{t('profile.identity.username')}</label>
          {hasUsername ? (
            <p className="term-profile-username-locked">@{profile?.username}</p>
          ) : (
            <>
              <input
                className="term-profile-input"
                value={usernameInput}
                onChange={(e) =>
                  setUsernameInput(normalizeUsernameInput(e.target.value).replace(/[^a-z0-9_]/g, ''))
                }
                placeholder="trader_jane"
                maxLength={20}
                autoComplete="username"
              />
            </>
          )}
          <div className="term-profile-field-row">
            <div>
              <label className="term-profile-label">{t('profile.identity.fullName')}</label>
              <input
                className="term-profile-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('profile.identity.namePlaceholder')}
              />
            </div>
            <div>
              <label className="term-profile-label">{t('profile.identity.country')}</label>
              <input
                className="term-profile-input"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder={t('profile.identity.countryPlaceholder')}
              />
            </div>
          </div>
          <button
            type="button"
            className="term-modal-primary term-profile-save"
            disabled={isSavingProfile}
            onClick={handleSaveProfile}
          >
            {isSavingProfile ? (
              <Loader2 size={16} className="animate-spin" />
            ) : profileSaveSuccess ? (
              <>
                <CheckCircle size={16} /> {t('profile.identity.saved')}
              </>
            ) : (
              <>
                <Save size={16} /> {t('profile.identity.save')}
              </>
            )}
          </button>
          {profileSaveError && (
            <p className="term-profile-err">
              <AlertCircle size={14} /> {profileSaveError}
            </p>
          )}

        </section>
        ) : null}

        {show('security') ? (
        <section
          id="profile-security"
          className="term-profile-card term-profile-card--section term-profile-card--security"
        >
          <h2 className="term-profile-card-title">{t('profile.securityTitle')}</h2>
          <ProfileNotificationSettings />
          <ProfileSecurityPanel idPrefix="profile-sec" mode="credentials" />
        </section>
        ) : null}

        {show('wallets') ? (
        <section id="profile-wallets" className="term-profile-card term-profile-card--section">
          <h2 className="term-profile-card-title">{t('profile.walletsTitle')}</h2>
          <ul className="term-profile-wallet-list">
            {linkedWallets.map((w) => (
              <li key={w}>
                <code>{w}</code>
                <button
                  type="button"
                  className="term-profile-wallet-remove"
                  onClick={() => handleRemoveWallet(w)}
                  aria-label={t('profile.wallets.removeAria')}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
          <div className="term-profile-wallet-add">
            <input
              className="term-profile-input"
              value={newWalletInput}
              onChange={(e) => setNewWalletInput(e.target.value)}
              placeholder="0x…"
            />
            <button
              type="button"
              className="term-btn-sm"
              disabled={walletBusy}
              onClick={handleAddWallet}
            >
              <Plus size={14} /> {t('profile.wallets.add')}
            </button>
          </div>
          {walletError && (
            <p className="term-profile-err">
              <AlertCircle size={14} /> {walletError}
            </p>
          )}
        </section>
        ) : null}

        {show('betting') ? (
        <section
          id="profile-betting"
          className="term-profile-card term-profile-card--section term-profile-card--betting"
        >
          <h2 className="term-profile-card-title">{t('profile.bettingTitle')}</h2>
          <p className="term-profile-muted" style={{ marginBottom: 12 }}>
            {t('profile.bettingLead')}
          </p>
          <ProfileBettingPanel />
        </section>
        ) : null}

        {show('history') ? (
        <section
          id="profile-login-history"
          className="term-profile-card term-profile-card--section term-profile-card--history"
        >
          <h2 className="term-profile-card-title">{t('profile.loginHistoryTitle')}</h2>
          <ProfileLoginHistoryPanel />
        </section>
        ) : null}
      </div>
    </div>
  );
};

export default TerminalProfilePanel;
