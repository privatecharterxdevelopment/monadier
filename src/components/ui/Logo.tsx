import React from 'react';
import { Link } from 'react-router-dom';
import { isAppHost, LANDING_PATH } from '../../lib/appUrls';

const LOGO_SRC = '/images/brand/hypergain-logo.png';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  withTagline?: boolean;
  iconOnly?: boolean;
  /** light = dark mark on grey/white; dark = light mark for dark surfaces */
  theme?: 'dark' | 'light';
  /** When false, render mark only (parent supplies the link). */
  linked?: boolean;
  /** Home link target (marketing landing by default). */
  homeTo?: string;
  className?: string;
  /**
   * `image` = marketing PNG (landing).
   * `app` = classic plus + HyperGain wordmark (app.hypergain.io).
   * `auto` = app host → app mark, else image.
   */
  variant?: 'auto' | 'image' | 'app';
}

const HEIGHT: Record<NonNullable<LogoProps['size']>, number> = {
  sm: 30,
  md: 40,
  lg: 48,
};

const TEXT_SIZE: Record<NonNullable<LogoProps['size']>, string> = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-3xl',
};

const ICON_SIZE: Record<NonNullable<LogoProps['size']>, string> = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

const Logo: React.FC<LogoProps> = ({
  size = 'md',
  withTagline = false,
  iconOnly = false,
  theme = 'light',
  linked = true,
  homeTo = LANDING_PATH,
  className = '',
  variant = 'auto',
}) => {
  const useAppMark =
    variant === 'app' || (variant === 'auto' && typeof window !== 'undefined' && isAppHost());
  const isLight = theme !== 'dark';
  const h = HEIGHT[size];

  const PlusIcon = () => (
    <svg
      className={ICON_SIZE[size]}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
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

  const mark = useAppMark ? (
    <>
      <PlusIcon />
      {!iconOnly && (
        <span
          className={`font-sans font-medium tracking-tight ${
            isLight ? 'text-[#0a0a0a]' : 'text-white'
          } ${TEXT_SIZE[size]}`}
        >
          HyperGain
        </span>
      )}
    </>
  ) : (
    <img
      src={LOGO_SRC}
      alt="HyperGain"
      height={h}
      className={`landing-logo-img${theme === 'dark' ? ' landing-logo-img--invert' : ''}`}
      style={{ height: h, width: 'auto' }}
      decoding="async"
      draggable={false}
    />
  );

  const wrapClass = className ? ` ${className}` : '';

  if (iconOnly) {
    const icon = useAppMark ? <PlusIcon /> : mark;
    if (!linked) {
      return <span className={`inline-flex items-center${wrapClass}`}>{icon}</span>;
    }
    return (
      <Link to="/" className={`inline-flex items-center${wrapClass}`} aria-label="HyperGain">
        {icon}
      </Link>
    );
  }

  return (
    <div className={`flex flex-col${wrapClass}`}>
      {linked ? (
        <Link
          to={homeTo}
          className={`inline-flex items-center${useAppMark ? ' gap-2' : ''} landing-logo-mark`}
          aria-label="HyperGain"
        >
          {mark}
        </Link>
      ) : (
        <span className={`inline-flex items-center${useAppMark ? ' gap-2' : ''} landing-logo-mark`}>
          {mark}
        </span>
      )}
      {withTagline && (
        <span className="text-secondary text-xs mt-1 tracking-wide font-sans">
          Decentralized Trading
        </span>
      )}
    </div>
  );
};

export default Logo;
