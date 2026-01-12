import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MobileMenuProps {
  onDownloadClick?: () => void;
}

const MobileMenu: React.FC<MobileMenuProps> = ({ onDownloadClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { path: '/how-it-works', label: 'How it works' },
    { path: '/trading-bot', label: 'Bot Trading' },
    // { path: '/forex', label: 'Forex MT5' }, // Coming soon
    { path: '/about', label: 'About' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-400 hover:text-white transition-colors"
        aria-label="Toggle menu"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-20 left-0 right-0 bg-background/95 backdrop-blur-lg border-b border-white/5 z-50"
          >
            <nav className="container-custom py-6">
              <div className="flex flex-col space-y-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setIsOpen(false)}
                    className={`text-base font-medium transition-colors ${
                      isActive(link.path) ? 'text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}

                {onDownloadClick && (
                  <button
                    onClick={() => {
                      onDownloadClick();
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-base font-medium"
                  >
                    <Download size={18} />
                    Download
                  </button>
                )}

                <div className="pt-4 border-t border-white/5 flex flex-col space-y-3">
                  <Link
                    to="/login"
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-white transition-colors text-base font-medium"
                  >
                    Sign in
                  </Link>
                  <Link to="/register" onClick={() => setIsOpen(false)}>
                    <button className="w-full px-4 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors">
                      Trade now
                    </button>
                  </Link>
                </div>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MobileMenu;
