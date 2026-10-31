import React from 'react';
import { teamVisual } from '../../../lib/sports/teamVisuals';

type Props = {
  name: string;
  size?: number;
};

const TeamBadge: React.FC<Props> = ({ name, size = 22 }) => {
  const visual = teamVisual(name);
  const dim = Number.isFinite(size) && size > 0 ? size : 22;

  if (visual.flagUrl) {
    return (
      <img
        className="hl-sb-team-flag"
        src={visual.flagUrl}
        alt=""
        width={dim}
        height={Math.round(dim * 0.75)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <span className="hl-sb-team-emoji" aria-hidden>
      {visual.emoji}
    </span>
  );
};

export default TeamBadge;
