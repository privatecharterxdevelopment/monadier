import React, { useEffect, useState } from 'react';
import { User, Loader2, CheckCircle, AlertCircle, PartyPopper } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import TerminalModalFrame from './TerminalModalFrame';
import {
  isUsernameAvailable,
  setUsernameOnce,
  patchUserProfile,
} from '../../lib/profile';
import { validateUsername, normalizeUsernameInput } from '../../lib/username';
import { fireProfileOnboardingConfetti } from '../../lib/confettiCelebration';
import { BRAND_NAME } from '../../lib/brand';
import HlBotFlowGuide from './HlBotFlowGuide';

type Props = {
  onComplete: () => void;
};

const TerminalProfileOnboardingModal: React.FC<Props> = ({ onComplete }) => {
  const { user, profile, refreshProfile } = useAuth();
  const hasUsername = Boolean(profile?.username?.trim());

  const [usernameInput, setUsernameInput] = useState('');
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const [usernameOk, setUsernameOk] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setUsernameInput(profile.username || '');
      setFullName(profile.full_name || '');
      setCountry(profile.country || '');
    }
  }, [profile]);

  useEffect(() => {
    if (hasUsername || !usernameInput.trim()) {
      setUsernameOk(null);
      return;
    }
    const validation = validateUsername(usernameInput);
    if (validation) {
      setUsernameOk(false);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const ok = await isUsernameAvailable(usernameInput);
        setUsernameOk(ok);
      } catch {
        setUsernameOk(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [usernameInput, hasUsername]);

  const handleComplete = async () => {
    if (!user?.id) return;

    if (!fullName.trim() || !country.trim()) {
      setError('Please enter your name and country.');
      return;
    }

    if (!hasUsername) {
      const validation = validateUsername(usernameInput);
      if (validation) {
        setError(validation);
        return;
      }
      if (usernameOk === false) {
        setError('Username is already taken.');
        return;
      }
    }

    try {
      setBusy(true);
      setError(null);

      if (!hasUsername) {
        await setUsernameOnce(usernameInput);
      }

      await patchUserProfile(user.id, {
        full_name: fullName.trim(),
        country: country.trim(),
        onboarding_completed: true,
      });

      await refreshProfile();
      fireProfileOnboardingConfetti();
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile');
      setBusy(false);
    }
  };

  const footer = (
    <button
      type="button"
      className="term-modal-primary"
      onClick={handleComplete}
      disabled={busy || (!hasUsername && (checkingUsername || usernameOk === false))}
    >
      {busy ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <PartyPopper size={16} />
          Complete setup
        </>
      )}
    </button>
  );

  return (
    <TerminalModalFrame
      title={`Welcome to ${BRAND_NAME}`}
      subtitle="Complete your profile to get started"
      icon={<User size={18} />}
      onClose={() => {}}
      closeDisabled
      footer={footer}
    >
        <p className="term-modal-hint term-onboarding-intro">
          Choose a public username, your display name, and country. This only takes a moment.
        </p>

        <HlBotFlowGuide />

        {!hasUsername && (
          <>
            <label className="term-profile-label" htmlFor="term-onboard-username">
              Username
            </label>
            <input
              id="term-onboard-username"
              className="term-profile-input"
              value={usernameInput}
              onChange={(e) => setUsernameInput(normalizeUsernameInput(e.target.value))}
              placeholder="trader_alpha"
              autoComplete="username"
              disabled={busy}
            />
            {checkingUsername && (
              <p className="term-modal-hint">Checking availability…</p>
            )}
            {!checkingUsername && usernameOk === true && usernameInput.trim() && (
              <p className="term-modal-hint term-modal-hint--ok">
                <CheckCircle size={14} /> Username available
              </p>
            )}
            {!checkingUsername && usernameOk === false && (
              <p className="term-modal-hint term-modal-hint--warn">Username taken</p>
            )}
          </>
        )}

        {hasUsername && (
          <div className="term-modal-card">
            <span className="term-modal-label">Username</span>
            <strong className="term-modal-value">@{profile?.username}</strong>
          </div>
        )}

        <label className="term-profile-label" htmlFor="term-onboard-name">
          Display name
        </label>
        <input
          id="term-onboard-name"
          className="term-profile-input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
          disabled={busy}
        />

        <label className="term-profile-label" htmlFor="term-onboard-country">
          Country
        </label>
        <input
          id="term-onboard-country"
          className="term-profile-input"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Switzerland"
          disabled={busy}
        />

        {error && (
          <div className="term-modal-alert term-modal-alert--err">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
    </TerminalModalFrame>
  );
};

export default TerminalProfileOnboardingModal;
