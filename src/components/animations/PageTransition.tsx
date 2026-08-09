import React from 'react';
import { motion } from 'framer-motion';
import { useLandingThemeOptional } from '../../contexts/LandingThemeContext';

interface PageTransitionProps {
  children: React.ReactNode;
  /** Lock to viewport height (trading terminal — no page overflow) */
  fillViewport?: boolean;
}

const PageTransition: React.FC<PageTransitionProps> = ({ children, fillViewport }) => {
  const theme = useLandingThemeOptional();
  const isDark = theme === 'dark';

  return (
    <motion.div
      className={fillViewport ? 'hl-terminal-shell' : 'min-h-[100dvh]'}
      style={{ backgroundColor: isDark ? '#000000' : '#e8e8ec' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.22,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;