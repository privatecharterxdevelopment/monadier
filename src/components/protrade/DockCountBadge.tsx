import React from 'react';

type Props = {
  count: number;
  tone?: 'pos' | 'neg' | null;
  classPrefix?: 'hl-dock-count' | 'term-dock-count';
};

const DockCountBadge: React.FC<Props> = ({
  count,
  tone,
  classPrefix = 'hl-dock-count',
}) => {
  if (count <= 0) return null;
  const toneClass =
    tone === 'pos'
      ? `${classPrefix}--pos`
      : tone === 'neg'
        ? `${classPrefix}--neg`
        : '';
  return (
    <span className={`${classPrefix} ${toneClass}`.trim()} aria-label={`${count} open`}>
      ({count})
    </span>
  );
};

export default DockCountBadge;
