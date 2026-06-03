import React from 'react';
import { resolveProfileAvatarEmoji } from '../../lib/profileAvatar';

type Props = {
  profile: { avatar_emoji?: string | null; avatar_url?: string | null } | null | undefined;
  userId?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClass = {
  sm: 'term-avatar--sm',
  md: 'term-avatar--md',
  lg: 'term-avatar--lg',
} as const;

const ProfileAvatar: React.FC<Props> = ({ profile, userId, size = 'md', className = '' }) => {
  const imageSrc = profile?.avatar_url?.trim();
  const emoji = resolveProfileAvatarEmoji(profile, userId);

  if (imageSrc) {
    return (
      <span
        className={`term-avatar term-avatar--photo ${sizeClass[size]} ${className}`.trim()}
      >
        <img src={imageSrc} alt="" className="term-avatar-img" />
      </span>
    );
  }

  return (
    <span
      className={`term-avatar ${sizeClass[size]} ${className}`.trim()}
      role="img"
      aria-label="Profile avatar"
    >
      {emoji}
    </span>
  );
};

export default ProfileAvatar;
