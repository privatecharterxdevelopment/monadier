import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useLandingTheme } from '../../contexts/LandingThemeContext';

type Props = {
  className?: string;
};

const LandingThemeToggle: React.FC<Props> = ({ className = '' }) => {
  const { theme, toggleTheme } = useLandingTheme();
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      className={`landing-theme-toggle${className ? ` ${className}` : ''}`}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Dark mode' : 'Light mode'}
      onClick={toggleTheme}
    >
      {isLight ? <Moon size={15} strokeWidth={2.25} aria-hidden /> : <Sun size={15} strokeWidth={2.25} aria-hidden />}
    </button>
  );
};

export default LandingThemeToggle;
