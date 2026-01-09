import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  withTagline?: boolean;
}

const Logo: React.FC<LogoProps> = ({ size = 'md', withTagline = false }) => {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl'
  };

  return (
    <div className="flex flex-col">
      <Link to="/" className="inline-flex items-center">
        <Plus className="mr-2" />
        <span className={`font-sans font-medium tracking-tight ${sizeClasses[size]}`}>
          monadier
        </span>
      </Link>
      {withTagline && (
        <span className="text-secondary text-xs mt-1 tracking-wide">
          Private Banking Reimagined
        </span>
      )}
    </div>
  );
};

export default Logo;