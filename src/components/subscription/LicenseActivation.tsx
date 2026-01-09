import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Check, X, AlertTriangle, Loader2, Shield, Sparkles } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { SUBSCRIPTION_PLANS, validateLicenseFormat, PlanTier } from '../../lib/subscription';

interface LicenseActivationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LicenseActivation: React.FC<LicenseActivationProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { activateLicense } = useSubscription();
  const [licenseCode, setLicenseCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [detectedPlan, setDetectedPlan] = useState<PlanTier | null>(null);

  // Format license code as user types
  const handleCodeChange = (value: string) => {
    // Remove all non-alphanumeric characters except dashes
    let cleaned = value.toUpperCase().replace(/[^A-Z0-9-]/g, '');

    // Auto-format with dashes
    const parts = cleaned.replace(/-/g, '').match(/.{1,4}/g) || [];
    const formatted = parts.slice(0, 6).join('-');

    setLicenseCode(formatted);
    setError(null);

    // Check if valid format and detect plan
    if (formatted.length >= 3) {
      const validation = validateLicenseFormat(formatted);
      if (validation.valid && validation.planTier) {
        setDetectedPlan(validation.planTier);
      } else {
        setDetectedPlan(null);
      }
    }
  };

  const handleActivate = async () => {
    if (!licenseCode) {
      setError('Please enter a license code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await activateLicense(licenseCode);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 2000);
      } else {
        setError(result.error || 'Failed to activate license');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-card-dark border border-gray-800 rounded-2xl p-6 w-full max-w-md mx-4"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/20 rounded-lg">
                <Key className="w-5 h-5 text-accent" />
              </div>
              <h2 className="text-xl font-bold text-white">Activate License</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {success ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-8"
            >
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">License Activated!</h3>
              <p className="text-gray-400">
                Your {detectedPlan && SUBSCRIPTION_PLANS[detectedPlan].name} subscription is now active.
              </p>
            </motion.div>
          ) : (
            <>
              {/* License Input */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Enter your license code
                  </label>
                  <input
                    type="text"
                    value={licenseCode}
                    onChange={e => handleCodeChange(e.target.value)}
                    placeholder="XXX-XXXX-XXXX-XXXX-XXXX-XXX"
                    className="w-full px-4 py-3 bg-background border border-gray-700 rounded-xl text-white text-center font-mono text-lg tracking-wider focus:outline-none focus:border-accent transition-colors"
                    maxLength={27}
                    disabled={isLoading}
                  />
                </div>

                {/* Detected Plan */}
                {detectedPlan && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3 bg-accent/10 border border-accent/20 rounded-lg"
                  >
                    <Sparkles className="w-5 h-5 text-accent" />
                    <div>
                      <p className="text-white font-medium">
                        {SUBSCRIPTION_PLANS[detectedPlan].name} Plan Detected
                      </p>
                      <p className="text-sm text-gray-400">
                        {SUBSCRIPTION_PLANS[detectedPlan].description}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Error Message */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
                  >
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-red-400 text-sm">{error}</p>
                  </motion.div>
                )}

                {/* Activate Button */}
                <button
                  onClick={handleActivate}
                  disabled={isLoading || !licenseCode}
                  className="w-full py-3 bg-accent hover:bg-accent-dark text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Activating...
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5" />
                      Activate License
                    </>
                  )}
                </button>
              </div>

              {/* Help Text */}
              <div className="mt-6 pt-4 border-t border-gray-800">
                <p className="text-sm text-gray-500 text-center">
                  Your license code was sent to your email after purchase.
                  <br />
                  Contact <span className="text-accent">support@monadier.com</span> if you need help.
                </p>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LicenseActivation;
