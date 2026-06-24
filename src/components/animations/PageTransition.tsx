import React from 'react';
import { motion } from 'framer-motion';

interface PageTransitionProps {
  children: React.ReactNode;
  /** Lock to viewport height (trading terminal — no page overflow) */
  fillViewport?: boolean;
}

const PageTransition: React.FC<PageTransitionProps> = ({ children, fillViewport }) => {
  return (
    <motion.div
      className={fillViewport ? 'hl-terminal-shell' : 'min-h-[100dvh]'}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1]
      }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;