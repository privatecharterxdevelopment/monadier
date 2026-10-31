import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, ArrowRight } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';

const spring = { type: 'spring' as const, stiffness: 420, damping: 32 };

const LandingCta: React.FC = () => {
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    if (!open) {
      setOpen(true);
      return;
    }
    goToOpenApp('');
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      layout
      aria-expanded={open}
      className="glass-pill-light flex items-center gap-3 pl-3 pr-3 py-2.5 md:py-3 text-left max-w-[min(100%,22rem)] md:max-w-none cursor-pointer select-none border border-[#c5c5cb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a0a0a]/20"
      whileTap={{ scale: 0.98 }}
      transition={spring}
    >
      <motion.div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 border border-[#c5c5cb]"
        animate={open ? { scale: [1, 1.08, 1], rotate: [0, 8, 0] } : { scale: 1, rotate: 0 }}
        transition={{ duration: 0.45 }}
      >
        <Bot size={18} className="text-[#3f3f46]" strokeWidth={1.75} />
      </motion.div>

      <div className="flex-1 min-w-0 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {!open ? (
            <motion.span
              key="label"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="block text-sm font-semibold text-[#0a0a0a] whitespace-nowrap"
            >
              Get started
            </motion.span>
          ) : (
            <motion.div
              key="details"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2"
            >
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 }}
                className="text-[13px] font-medium text-[#0a0a0a] whitespace-nowrap"
              >
                HyperGain · Hyperliquid
              </motion.span>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="hidden sm:inline text-[#c4c4c4] text-xs"
              >
                ·
              </motion.span>
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 }}
                className="text-[13px] text-[#71717a] whitespace-nowrap"
              >
                HyperGain bot
              </motion.span>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-1 text-[12px] font-semibold text-[#0a0a0a] sm:ml-1 mt-1 sm:mt-0"
              >
                Continue
                <ArrowRight size={14} strokeWidth={2.5} />
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        className="h-9 w-9 shrink-0 rounded-full p-[2px]"
        animate={open ? { rotate: 180 } : { rotate: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{
          background: open
            ? 'conic-gradient(from 200deg, #0a0a0a, #71717a, #e4e4e8, #0a0a0a)'
            : 'conic-gradient(from 120deg, #0a0a0a, #a1a1aa, #e4e4e8, #0a0a0a)',
        }}
      >
        <div className="h-full w-full rounded-full bg-[#efeff2] flex items-center justify-center">
          <motion.div animate={open ? { rotate: 0, opacity: 1 } : { rotate: -90, opacity: 0.35 }}>
            <ArrowRight size={14} className="text-[#52525b]" strokeWidth={2} />
          </motion.div>
        </div>
      </motion.div>
    </motion.button>
  );
};

export default LandingCta;
