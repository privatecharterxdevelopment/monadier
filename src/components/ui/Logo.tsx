import React from 'react';
import { Link } from 'react-router-dom';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  withTagline?: boolean;
  iconOnly?: boolean;
}

const Logo: React.FC<LogoProps> = ({ size = 'md', withTagline = false, iconOnly = false }) => {
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
      <rect width="32" height="32" rx="8" fill="white" fillOpacity="0.1"/>
      <path
        d="M16 8V24M8 16H24"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );

  if (iconOnly) {
    return (
      <Link to="/" className="inline-flex items-center">
        <PlusIcon />
      </Link>
    );
  }

  return (
    <div className="flex flex-col">
      <Link to="/" className="inline-flex items-center gap-2">
        <PlusIcon />
        <span className={`font-sans font-medium tracking-tight text-white ${sizeClasses[size]}`}>
          monadier
        </span>
      </Link>
      {withTagline && (
        <span className="text-gray-500 text-xs mt-1 tracking-wide ml-10">
          Decentralized Trading
        </span>
      )}
    </div>
  );
};

export default Logo;
