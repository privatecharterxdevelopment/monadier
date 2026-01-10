import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Logo from '../components/ui/Logo';
import { signUp } from '../lib/supabase';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    if (!acceptedTerms) {
      setError('You must accept the terms and conditions to continue');
      setIsLoading(false);
      return;
    }
    
    try {
      const { data, error } = await signUp(email, password, fullName, country);

      if (error) {
        throw error;
      }

      // Check if email confirmation is required
      if (data?.user && !data.session) {
        // Email confirmation required - show success message
        setError('');
        navigate('/login', { state: { message: 'Please check your email to confirm your account before signing in.' } });
        return;
      }

      // Redirect directly to dashboard if auto-confirmed
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Registration error:', error);
      setError(error.message || 'Failed to create account. Please try again.');
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
            <h1 className="font-display text-3xl mb-6 text-center">Apply for Access</h1>
            
            {error && (
              <div className="mb-6 p-3 bg-error/10 border border-error/30 rounded-md text-error text-sm">
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <Input
                label="Full Name"
                type="text"
                id="fullName"
                placeholder="John Smith"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              
              <Input
                label="Email"
                type="email"
                id="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              
              <Input
                label="Password"
                type="password"
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              
              <Input
                label="Country"
                type="text"
                id="country"
                placeholder="Switzerland"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
              />
              
              <div className="mb-6">
                <label className="flex items-start space-x-3">
                  <input 
                    type="checkbox" 
                    className="mt-1"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    required
                  />
                  <span className="text-sm text-secondary">
                    I accept the <Link to="/terms" className="text-accent hover:underline">Terms and Conditions</Link> and <Link to="/privacy" className="text-accent hover:underline">Privacy Policy</Link>
                  </span>
                </label>
              </div>
              
              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={isLoading}
              >
                Create Account
              </Button>
            </form>
            
            <div className="mt-6 text-center text-secondary">
              <span>Already have an account? </span>
              <Link to="/login" className="text-accent hover:underline">
                Sign In
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterPage;