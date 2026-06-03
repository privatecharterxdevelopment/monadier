import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, ArrowRight, Mail } from 'lucide-react';

const SupportWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 w-72 rounded-2xl border border-black/[0.08] bg-black/80 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 border-b border-black/[0.06]">
              <h3 className="text-lg font-display font-medium text-primary mb-1">
                Ready to bot trade?
              </h3>
              <p className="text-secondary text-sm">
                Start earning passive income today
              </p>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <Link to="/register">
                <button className="w-full px-4 py-3 bg-white text-gray-900 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-2">
                  Try it for free
                  <ArrowRight size={16} />
                </button>
              </Link>

              <div className="text-center">
                <a
                  href="mailto:support@monadier.com"
                  className="inline-flex items-center gap-2 text-secondary hover:text-primary text-sm transition-colors"
                >
                  <Mail size={14} />
                  Need support? Contact us
                </a>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-black/[0.04] border-t border-black/[0.06]">
              <Link
                to="/support"
                className="text-secondary hover:text-primary text-xs transition-colors"
              >
                Visit support center →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="w-14 h-14 rounded-full bg-black/[0.06] backdrop-blur-xl border border-black/[0.1] flex items-center justify-center text-primary hover:bg-white/20 transition-colors shadow-lg"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </motion.button>
    </div>
  );
};

export default SupportWidget;
