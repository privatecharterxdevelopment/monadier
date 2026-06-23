import React from 'react';
import { Link } from 'react-router-dom';
import { LANDING_PATH } from '../../lib/appUrls';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  withTagline?: boolean;
  iconOnly?: boolean;
  /** light = dark mark on grey/white studio landing */
  theme?: 'dark' | 'light';
  /** When false, render mark only (parent supplies the link). */
  linked?: boolean;
  /** Home link target (marketing landing by default). */
  homeTo?: string;
}

const Logo: React.FC<LogoProps> = ({
  size = 'md',
  withTagline = false,
  iconOnly = false,
  theme = 'light',
  linked = true,
  homeTo = LANDING_PATH,
}) => {
  const isLight = theme !== 'dark';
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-3xl'
  };

  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };

  // Plus icon - the Monadier brand mark
  const PlusIcon = () => (
    <svg
      className={iconSizes[size]}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        width="32"
        height="32"
        rx="8"
        fill={isLight ? '#0a0a0a' : 'white'}
        fillOpacity={isLight ? 0.06 : 0.1}
      />
      <path
        d="M16 8V24M8 16H24"
        stroke={isLight ? '#0a0a0a' : 'white'}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );

  const mark = (
    <>
      <PlusIcon />
      {!iconOnly && (
        <span
          className={`font-sans font-medium tracking-tight ${
            isLight ? 'text-[#0a0a0a]' : 'text-white'
          } ${sizeClasses[size]}`}
        >
          monadier
        </span>
      )}
    </>
  );

  if (iconOnly) {
    if (!linked) {
      return <span className="inline-flex items-center">{mark}</span>;
    }
    return (
      <Link to="/" className="inline-flex items-center">
        <PlusIcon />
      </Link>
    );
  }

  return (
    <div className="flex flex-col">
      {linked ? (
        <Link to={homeTo} className="inline-flex items-center gap-2">
          {mark}
        </Link>
      ) : (
        <span className="inline-flex items-center gap-2">{mark}</span>
      )}
      {withTagline && (
        <span className="text-secondary text-xs mt-1 tracking-wide ml-10">
          Decentralized Trading
        </span>
      )}
    </div>
  );
};

export default Logo;
