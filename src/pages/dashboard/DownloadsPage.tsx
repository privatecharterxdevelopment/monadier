import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  ExternalLink,
  Key,
  Copy,
  Check,
  Lock,
  BarChart3,
  Shield,
  AlertCircle,
  FileCode,
  Monitor
} from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';

const DownloadsPage: React.FC = () => {
  const { subscription, isSubscribed, planTier } = useSubscription();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [licenseKey, setLicenseKey] = useState<string | null>(null);

  // Generate/load license key for user
  useEffect(() => {
    if (user && isSubscribed && planTier !== 'free') {
      // Generate a deterministic license key based on user ID and subscription
      const generateLicenseKey = () => {
        const userId = user.id.replace(/-/g, '').substring(0, 8).toUpperCase();
        const planCode = planTier === 'starter' ? 'ST' : planTier === 'pro' ? 'PR' : planTier === 'elite' ? 'EL' : 'DT';
        const timestamp = subscription?.startDate
          ? new Date(subscription.startDate).getTime().toString(36).toUpperCase().substring(0, 4)
          : 'XXXX';
        return `MON-${planCode}-${userId}-${timestamp}`;
      };
      setLicenseKey(generateLicenseKey());
    }
  }, [user, isSubscribed, planTier, subscription]);

  const copyLicenseKey = () => {
    if (licenseKey) {
      navigator.clipboard.writeText(licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasValidSubscription = isSubscribed && planTier !== 'free';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-medium text-white mb-2">Downloads</h1>
        <p className="text-gray-400">Download MetaTrader 5 and your trading bot files</p>
      </div>

      {/* License Key Section */}
      {hasValidSubscription && licenseKey ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card-dark rounded-xl border border-green-500/20 overflow-hidden"
        >
          <div className="p-6 bg-green-500/5 border-b border-green-500/20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Key className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Your License Key</h3>
                <p className="text-gray-400 text-sm">Use this key to activate the MT5 trading bot</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-3 p-4 bg-background rounded-lg border border-gray-700">
              <code className="flex-1 text-lg font-mono text-green-400 tracking-wider">{licenseKey}</code>
              <button
                onClick={copyLicenseKey}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Copy license key"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : (
                  <Copy className="w-5 h-5 text-gray-400" />
                )}
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
              <Shield className="w-4 h-4" />
              <span>This license is tied to your account. Do not share it.</span>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card-dark rounded-xl border border-yellow-500/20 p-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <Lock className="w-6 h-6 text-yellow-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">License Required</h3>
              <p className="text-gray-400 text-sm">
                Purchase a subscription to get your personal license key and download the MT5 bot.
              </p>
            </div>
            <Link to="/dashboard/subscriptions">
              <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg font-medium transition-colors">
                View Plans
              </button>
            </Link>
          </div>
        </motion.div>
      )}

      {/* Downloads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MetaTrader 5 Download */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden"
        >
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Monitor className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">MetaTrader 5</h3>
                <p className="text-gray-400 text-sm">Trading Platform</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Download the official MetaTrader 5 platform to run the Monadier trading bot. Available for Windows, macOS, iOS, and Android.
            </p>
          </div>
          <div className="p-6 space-y-3">
            <a
              href="https://www.metatrader5.com/en/download"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 bg-background rounded-lg border border-gray-700 hover:border-blue-500/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Download className="w-5 h-5 text-blue-400" />
                <span className="text-white">Windows</span>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
            </a>
            <a
              href="https://www.metatrader5.com/en/download"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 bg-background rounded-lg border border-gray-700 hover:border-blue-500/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Download className="w-5 h-5 text-blue-400" />
                <span className="text-white">macOS</span>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
            </a>
            <a
              href="https://www.metatrader5.com/en/download"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 bg-background rounded-lg border border-gray-700 hover:border-blue-500/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Download className="w-5 h-5 text-blue-400" />
                <span className="text-white">Mobile (iOS/Android)</span>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
            </a>
          </div>
        </motion.div>

        {/* MT5 Bot Download */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`bg-card-dark rounded-xl border overflow-hidden ${hasValidSubscription ? 'border-gray-800' : 'border-gray-800/50 opacity-60'}`}
        >
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <FileCode className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Monadier MT5 Bot</h3>
                <p className="text-gray-400 text-sm">Expert Advisor (EA)</p>
              </div>
              {!hasValidSubscription && (
                <span className="ml-auto px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Requires License
                </span>
              )}
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Our proprietary Expert Advisor for MetaTrader 5. Automated forex trading with advanced risk management.
            </p>
          </div>
          <div className="p-6 space-y-3">
            {hasValidSubscription ? (
              <>
                <button
                  className="w-full flex items-center justify-between p-3 bg-purple-500/10 rounded-lg border border-purple-500/30 hover:border-purple-500/50 transition-colors group"
                  onClick={() => {
                    // TODO: Implement actual download
                    alert('Bot download will be available soon. Your license key: ' + licenseKey);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Download className="w-5 h-5 text-purple-400" />
                    <span className="text-white font-medium">Download Monadier_EA.ex5</span>
                  </div>
                  <span className="text-purple-400 text-sm">v1.0.0</span>
                </button>
                <div className="p-3 bg-background rounded-lg border border-gray-700">
                  <p className="text-gray-400 text-sm mb-2">Installation:</p>
                  <ol className="text-gray-500 text-xs space-y-1 list-decimal list-inside">
                    <li>Download the .ex5 file</li>
                    <li>Open MT5 → File → Open Data Folder</li>
                    <li>Navigate to MQL5/Experts</li>
                    <li>Paste the file and restart MT5</li>
                    <li>Drag the EA onto a chart and enter your license key</li>
                  </ol>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Lock className="w-12 h-12 text-gray-600 mb-3" />
                <p className="text-gray-400 mb-4">Purchase a subscription to download the trading bot</p>
                <Link to="/dashboard/subscriptions">
                  <button className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors">
                    Get License
                  </button>
                </Link>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Documentation Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card-dark rounded-xl border border-gray-800 p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 className="w-5 h-5 text-accent" />
          <h3 className="text-lg font-semibold text-white">Getting Started Guide</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-background rounded-lg">
            <span className="text-2xl font-display text-white/20">01</span>
            <h4 className="text-white font-medium mt-2">Install MT5</h4>
            <p className="text-gray-500 text-sm mt-1">Download and install MetaTrader 5 from the official website</p>
          </div>
          <div className="p-4 bg-background rounded-lg">
            <span className="text-2xl font-display text-white/20">02</span>
            <h4 className="text-white font-medium mt-2">Add the Bot</h4>
            <p className="text-gray-500 text-sm mt-1">Place the EA file in your Experts folder and restart MT5</p>
          </div>
          <div className="p-4 bg-background rounded-lg">
            <span className="text-2xl font-display text-white/20">03</span>
            <h4 className="text-white font-medium mt-2">Activate & Trade</h4>
            <p className="text-gray-500 text-sm mt-1">Enter your license key and configure your trading preferences</p>
          </div>
        </div>
      </motion.div>

      {/* Support Notice */}
      <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />
        <p className="text-gray-400 text-sm">
          Need help setting up? Contact our support team at{' '}
          <a href="mailto:support@monadier.com" className="text-blue-400 hover:underline">
            support@monadier.com
          </a>
        </p>
      </div>
    </div>
  );
};

export default DownloadsPage;
