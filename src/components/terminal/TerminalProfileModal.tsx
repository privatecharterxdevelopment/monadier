import React, { useEffect, useRef, useState } from 'react';
import {
  Save,
  CheckCircle,
  AlertCircle,
  Loader2,
  Lock,
  Mail,
  Plus,
  X,
  Eye,
  EyeOff,
  Upload,
  ImageIcon,
  User,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ProfileAvatar from '../profile/ProfileAvatar';
import TerminalModalFrame from './TerminalModalFrame';
import {
  PROFILE_AVATAR_EMOJIS,
  defaultAvatarEmojiForUser,
  isValidProfileAvatarEmoji,
} from '../../lib/profileAvatar';
import { uploadProfileAvatar, removeProfileAvatar } from '../../lib/profileAvatarUpload';
import { supabase, updatePassword, resetPassword, updateUserProfile } from '../../lib/supabase';

type Props = {
  onClose: () => void;
};

function isValidAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

const TerminalProfileModal: React.FC<Props> = ({ onClose }) => {
  const { user, profile, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
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

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  useEffect(() => {
    if (profile) {
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
      setProfileSaveError('Name and country are required');
      return;
    }
    setIsSavingProfile(true);
    setProfileSaveError(null);
    try {
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
      setProfileSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.id) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await uploadProfileAvatar(user.id, file);
      await refreshProfile();
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user?.id) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await removeProfileAvatar(user.id);
      await refreshProfile();
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAddWallet = async () => {
    if (!user?.id) return;
    const addr = newWalletInput.trim().toLowerCase();
    if (!isValidAddress(addr)) {
      setWalletError('Invalid address');
      return;
    }
    if (linkedWallets.includes(addr)) {
      setWalletError('Already linked');
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
      setWalletError(err instanceof Error ? err.message : 'Failed to add');
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
      setWalletError(err instanceof Error ? err.message : 'Failed to remove');
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      setPasswordError('At least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) throw error;
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleResetEmail = async () => {
    if (!user?.email) return;
    setPasswordBusy(true);
    try {
      const { error } = await resetPassword(user.email);
      if (error) throw error;
      setResetEmailSent(true);
      setTimeout(() => setResetEmailSent(false), 5000);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : 'Email failed');
    } finally {
      setPasswordBusy(false);
    }
  };

  const hasPhoto = Boolean(profile?.avatar_url?.trim());

  return (
    <TerminalModalFrame
      wide
      title="Profile"
      subtitle={user?.email ?? undefined}
      icon={<User size={18} />}
      onClose={onClose}
    >
      <div className="term-profile-modal">
        <section className="term-profile-modal-section">
          <h3 className="term-profile-modal-heading">Avatar</h3>
          <div className="term-profile-avatar-row">
            <ProfileAvatar profile={profile} userId={user?.id} size="lg" />
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
                Upload logo
              </button>
              {hasPhoto && (
                <button
                  type="button"
                  className="term-btn-sm"
                  disabled={avatarBusy}
                  onClick={handleRemoveAvatar}
                >
                  <ImageIcon size={14} />
                  Remove photo
                </button>
              )}
            </div>
          </div>
          <p className="term-modal-hint">
            {hasPhoto
              ? 'Your logo is shown on the dashboard. Emoji below is used when no photo is set.'
              : 'Upload a logo (max 2 MB), or pick an emoji.'}
          </p>
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
                  onClick={() => setAvatarEmoji(emoji)}
                  aria-pressed={avatarEmoji === emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <label className="term-profile-label">Full name</label>
          <input
            className="term-profile-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
          />
          <label className="term-profile-label">Country</label>
          <input
            className="term-profile-input"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Switzerland"
          />
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
                <CheckCircle size={16} /> Saved
              </>
            ) : (
              <>
                <Save size={16} /> Save profile
              </>
            )}
          </button>
          {profileSaveError && (
            <p className="term-profile-err">
              <AlertCircle size={14} /> {profileSaveError}
            </p>
          )}
        </section>

        <section className="term-profile-modal-section">
          <h3 className="term-profile-modal-heading">Linked wallets</h3>
          <p className="term-modal-hint">History and closes use all linked addresses.</p>
          <ul className="term-profile-wallet-list">
            {linkedWallets.map((w) => (
              <li key={w}>
                <code>{w}</code>
                <button
                  type="button"
                  className="term-profile-wallet-remove"
                  onClick={() => handleRemoveWallet(w)}
                  aria-label="Remove"
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
              <Plus size={14} /> Add
            </button>
          </div>
          {walletError && (
            <p className="term-profile-err">
              <AlertCircle size={14} /> {walletError}
            </p>
          )}
        </section>

        <section className="term-profile-modal-section">
          <h3 className="term-profile-modal-heading">
            <Lock size={16} /> Password
          </h3>
          <button
            type="button"
            className="term-btn-sm term-profile-reset-mail"
            disabled={passwordBusy || resetEmailSent}
            onClick={handleResetEmail}
          >
            <Mail size={14} />
            {resetEmailSent ? 'Email sent' : 'Send reset link'}
          </button>
          <label className="term-profile-label">New password</label>
          <div className="term-profile-input-wrap">
            <input
              className="term-profile-input"
              type={showPasswords ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button
              type="button"
              className="term-profile-eye"
              onClick={() => setShowPasswords((v) => !v)}
            >
              {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <label className="term-profile-label">Confirm</label>
          <input
            className="term-profile-input"
            type={showPasswords ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button
            type="button"
            className="term-modal-secondary term-profile-save"
            disabled={passwordBusy}
            onClick={handleChangePassword}
          >
            {passwordBusy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : passwordSuccess ? (
              'Updated'
            ) : (
              'Update password'
            )}
          </button>
          {passwordError && (
            <p className="term-profile-err">
              <AlertCircle size={14} /> {passwordError}
            </p>
          )}
        </section>
      </div>
    </TerminalModalFrame>
  );
};

export default TerminalProfileModal;
