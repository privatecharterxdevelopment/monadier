import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Key, Loader2, AlertCircle, Check, Monitor } from 'lucide-react';
import { useDesktopLicense } from '../../hooks/useDesktopLicense';
import Logo from '../ui/Logo';

interface LicenseActivationProps {
  onActivated: () => void;
}

const LicenseActivation: React.FC<LicenseActivationProps> = ({ onActivated }) => {
  const [licenseCode, setLicenseCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { validateLicense } = useDesktopLicense();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const formatLicenseCode = (value: string): string => {
    // Remove all non-alphanumeric characters and convert to uppercase
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    // Add dashes in the format: XXX-XXXX-XXXX-XXXX-XXXX-XXX
    const parts: string[] = [];
    if (cleaned.length > 0) parts.push(cleaned.slice(0, 3));
    if (cleaned.length > 3) parts.push(cleaned.slice(3, 7));
    if (cleaned.length > 7) parts.push(cleaned.slice(7, 11));
    if (cleaned.length > 11) parts.push(cleaned.slice(11, 15));
    if (cleaned.length > 15) parts.push(cleaned.slice(15, 19));
    if (cleaned.length > 19) parts.push(cleaned.slice(19, 22));

    return parts.join('-');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatLicenseCode(e.target.value);
    setLicenseCode(formatted);
    setError(null);
  };

  const handleActivate = async () => {
    if (!licenseCode || licenseCode.length < 25) {
      setError('Please enter a valid license code');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const result = await validateLicense(licenseCode, supabaseUrl);

      if (result.valid) {
        setSuccess(true);
        setTimeout(() => {
          onActivated();
        }, 1500);
      } else {
        setError(result.error || 'Invalid license code');
      }
    } catch (err) {
      setError('Failed to validate license. Please check your internet connection.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleActivate();
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <Check className="w-12 h-12 text-green-400" />
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">License Activated!</h2>
          <p className="text-gray-400">Starting Monadier Trading Bot...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">Activate Desktop License</h1>
          <p className="text-gray-400">
            Enter your license code to activate the desktop application
          </p>
        </div>

        <div className="bg-card-dark rounded-2xl border border-gray-800 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Monitor className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h3 className="text-white font-medium">Desktop License</h3>
              <p className="text-gray-500 text-sm">One-time activation per machine</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">License Code</label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="text"
                  value={licenseCode}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder="DSK-XXXX-XXXX-XXXX-XXXX-XXX"
                  className="w-full bg-background border border-gray-800 rounded-xl pl-12 pr-4 py-4 text-white font-mono tracking-wider focus:outline-none focus:border-accent transition-colors"
                  maxLength={27}
                  disabled={isValidating}
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl"
              >
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{error}</p>
              </motion.div>
            )}

            <button
              onClick={handleActivate}
              disabled={isValidating || !licenseCode}
              className="w-full py-4 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Validating...
                </>
              ) : (
                'Activate License'
              )}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-gray-500 text-sm text-center">
              Don't have a license?{' '}
              <a
                href="https://monadier.com/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-hover"
              >
                Purchase here
              </a>
            </p>
          </div>
        </div>

        <p className="text-gray-600 text-xs text-center mt-6">
          Your license is tied to this machine and cannot be transferred without contacting support.
        </p>
      </motion.div>
    </div>
  );
};

export default LicenseActivation;
