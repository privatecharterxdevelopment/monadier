import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useProTradeTheme } from '../../contexts/ProTradeThemeContext';

const ProTradeThemeIcon: React.FC = () => {
  const { theme, toggleTheme } = useProTradeTheme();
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      className="hl-topnav-icon-btn hl-theme-icon"
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      onClick={toggleTheme}
    >
      {isLight ? <Moon size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
    </button>
  );
};

export default ProTradeThemeIcon;
