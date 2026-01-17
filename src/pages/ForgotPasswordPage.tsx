import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Logo from '../components/ui/Logo';
import { resetPassword } from '../lib/supabase';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { error } = await resetPassword(email);

      if (error) {
        throw error;
      }

      setSuccess(true);
    } catch (error: any) {
      setError(error.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="container-custom py-6">
        <Logo size="md" />
      </div>

      <div className="flex-grow flex items-center justify-center px-4 py-12">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="card shadow-lg">
            {success ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h1 className="font-display text-2xl mb-3">Check Your Email</h1>
                <p className="text-gray-400 mb-6">
                  We've sent a password reset link to<br />
                  <span className="text-white font-medium">{email}</span>
                </p>
                <p className="text-gray-500 text-sm mb-6">
                  Didn't receive the email? Check your spam folder or try again.
                </p>
                <div className="flex flex-col gap-3">
                  <Button
                    variant="outline"
                    fullWidth
                    onClick={() => {
                      setSuccess(false);
                      setEmail('');
                    }}
                  >
                    Try Different Email
                  </Button>
                  <Link
                    to="/login"
                    className="text-accent hover:underline text-sm"
                  >
                    Back to Login
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
                >
                  <ArrowLeft size={16} />
                  Back to Login
                </Link>

                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-accent/20 rounded-full flex items-center justify-center">
                    <Mail className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h1 className="font-display text-2xl">Forgot Password?</h1>
                    <p className="text-gray-400 text-sm">No worries, we'll send you reset instructions.</p>
                  </div>
                </div>

                {error && (
                  <div className="mb-6 p-3 bg-error/10 border border-error/30 rounded-md text-error text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <Input
                    label="Email"
                    type="email"
                    id="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    isLoading={isLoading}
                    className="mt-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Sending...
                      </>
                    ) : (
                      'Send Reset Link'
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center text-secondary">
                  <span>Remember your password? </span>
                  <Link to="/login" className="text-accent hover:underline">
                    Sign in
                  </Link>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
