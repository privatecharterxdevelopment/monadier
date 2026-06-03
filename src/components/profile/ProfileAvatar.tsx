import React from 'react';
import { resolveProfileAvatarEmoji } from '../../lib/profileAvatar';

type Props = {
  profile: { avatar_emoji?: string | null } | null | undefined;
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
  const emoji = resolveProfileAvatarEmoji(profile, userId);

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
