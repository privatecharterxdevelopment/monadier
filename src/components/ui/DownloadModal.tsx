import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Apple, Download, Key, AlertCircle } from 'lucide-react';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  const handleDownloadMac = () => {
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = '/downloads/Monadier_1.0.0_aarch64.dmg';
    link.download = 'Monadier_1.0.0_aarch64.dmg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadWindows = () => {
    // Windows version coming soon
    return;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 p-4"
          >
            <div className="bg-[#0a0a0a] border border-gray-800 rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <Monitor className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Download Desktop App</h2>
                    <p className="text-sm text-gray-500">Monadier Trading Bot</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* License Notice */}
                <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <Key className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-400 font-medium text-sm">License Required</p>
                    <p className="text-amber-400/70 text-sm mt-1">
                      A valid desktop license is required to use the app. Purchase a lifetime plan to receive your license code.
                    </p>
                  </div>
                </div>

                {/* Download Options */}
                <div className="space-y-3">
                  <p className="text-gray-400 text-sm">Choose your platform:</p>

                  {/* macOS */}
                  <button
                    onClick={handleDownloadMac}
                    className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                      <Apple className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-medium">macOS</p>
                      <p className="text-gray-500 text-sm">Apple Silicon (M1/M2/M3)</p>
                    </div>
                    <Download className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                  </button>

                  {/* Windows */}
                  <button
                    onClick={handleDownloadWindows}
                    className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors group opacity-50 cursor-not-allowed"
                    disabled
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                      <Monitor className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-medium">Windows</p>
                      <p className="text-gray-500 text-sm">Coming soon</p>
                    </div>
                    <Download className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                {/* Info */}
                <div className="flex items-start gap-3 p-4 bg-white/5 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  <p className="text-gray-400 text-sm">
                    The desktop app provides the same trading features with native performance.
                    Your license is tied to one machine and cannot be transferred.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-white/5 border-t border-gray-800">
                <p className="text-gray-500 text-xs text-center">
                  By downloading, you agree to our{' '}
                  <a href="/terms" className="text-white hover:underline">Terms of Service</a>
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default DownloadModal;
