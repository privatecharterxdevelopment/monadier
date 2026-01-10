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
            className="absolute bottom-16 right-0 w-72 rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/5">
              <h3 className="text-lg font-display font-medium text-white mb-1">
                Ready to bot trade?
              </h3>
              <p className="text-gray-400 text-sm">
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
                  className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  <Mail size={14} />
                  Need support? Contact us
                </a>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-white/5 border-t border-white/5">
              <Link
                to="/support"
                className="text-gray-500 hover:text-white text-xs transition-colors"
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
        className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors shadow-lg"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </motion.button>
    </div>
  );
};

export default SupportWidget;
