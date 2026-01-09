import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Upload } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Logo from '../components/ui/Logo';
import { useAuth } from '../contexts/AuthContext';
import { updateKycStatus, uploadDocument } from '../lib/supabase';
import Input from '../components/ui/Input';

const steps = [
  'Select Account Type',
  'Identity Verification',
  'Residence Verification',
  'Initial Deposit',
  'Completion'
];

const KycFlowPage: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTier, setSelectedTier] = useState<'signature' | 'essential' | null>(null);
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [residenceDocument, setResidenceDocument] = useState<File | null>(null);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const handleTierSelection = (tier: 'signature' | 'essential') => {
    setSelectedTier(tier);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, type: 'id' | 'residence') => {
    if (event.target.files && event.target.files[0]) {
      if (type === 'id') {
        setIdDocument(event.target.files[0]);
      } else {
        setResidenceDocument(event.target.files[0]);
      }
    }
  };

  const calculateCashback = (amount: number) => {
    return amount * 0.05; // 5% cashback
  };

  const handleContinue = async () => {
    setError('');
    setIsLoading(true);
    
    try {
      if (currentStep === 0 && !selectedTier) {
        throw new Error('Please select an account type');
      }
      
      if (currentStep === 1 && !idDocument) {
        throw new Error('Please upload your ID document');
      }
      
      if (currentStep === 2 && !residenceDocument) {
        throw new Error('Please upload your proof of residence');
      }

      if (currentStep === 3 && depositAmount <= 0) {
        throw new Error('Please enter a valid deposit amount');
      }
      
      // Upload documents when needed
      if (currentStep === 1 && idDocument && user) {
        await uploadDocument(user.id, idDocument, 'id');
      }
      
      if (currentStep === 2 && residenceDocument && user) {
        await uploadDocument(user.id, residenceDocument, 'residence');
      }
      
      // When reaching the final step, update KYC status
      if (currentStep === steps.length - 2 && user) {
        await updateKycStatus(user.id, 'pending', selectedTier || 'essential');
        await refreshProfile();
      }
      
      // Move to next step or complete
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        navigate('/dashboard');
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred during the verification process');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Account Type Selection
        return (
          <div className="space-y-6">
            <h2 className="font-display text-2xl mb-4">Select Your Account Type</h2>
            
            <Card 
              className={`p-6 transition-all duration-300 ${
                selectedTier === 'signature' 
                  ? 'border-2 border-accent' 
                  : 'border border-gray-800'
              }`}
              hoverable
              onClick={() => handleTierSelection('signature')}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-display text-xl mb-2">Signature Account</h3>
                  <p className="text-secondary mb-4">Premium debit card with enhanced features</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center">
                      <Check size={16} className="text-accent mr-2" />
                      <span>Up to 500,000 CHF deposit limit</span>
                    </li>
                    <li className="flex items-center">
                      <Check size={16} className="text-accent mr-2" />
                      <span>5% USDT cashback on all transactions</span>
                    </li>
                    <li className="flex items-center">
                      <Check size={16} className="text-accent mr-2" />
                      <span>Built-in USDT wallet</span>
                    </li>
                    <li className="flex items-center">
                      <Check size={16} className="text-accent mr-2" />
                      <span>Priority support</span>
                    </li>
                  </ul>
                </div>
                <div className="text-right">
                  <div className="text-accent font-display text-2xl mb-1">0 CHF</div>
                  <div className="text-secondary text-sm">minimum deposit</div>
                </div>
              </div>
            </Card>
            
            <Card 
              className={`p-6 transition-all duration-300 ${
                selectedTier === 'essential' 
                  ? 'border-2 border-accent' 
                  : 'border border-gray-800'
              }`}
              hoverable
              onClick={() => handleTierSelection('essential')}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-display text-xl mb-2">Essential Account</h3>
                  <p className="text-secondary mb-4">Standard debit card with core features</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center">
                      <Check size={16} className="text-accent mr-2" />
                      <span>Up to 100,000 CHF deposit limit</span>
                    </li>
                    <li className="flex items-center">
                      <Check size={16} className="text-accent mr-2" />
                      <span>5% USDT cashback on all transactions</span>
                    </li>
                    <li className="flex items-center">
                      <Check size={16} className="text-accent mr-2" />
                      <span>Basic USDT wallet</span>
                    </li>
                    <li className="flex items-center">
                      <Check size={16} className="text-accent mr-2" />
                      <span>Standard support</span>
                    </li>
                  </ul>
                </div>
                <div className="text-right">
                  <div className="text-accent font-display text-2xl mb-1">0 CHF</div>
                  <div className="text-secondary text-sm">minimum deposit</div>
                </div>
              </div>
            </Card>
          </div>
        );
        
      case 1: // Identity Verification
        return (
          <div>
            <h2 className="font-display text-2xl mb-4">Identity Verification</h2>
            <p className="text-secondary mb-6">
              Please upload a clear photo of your passport or government ID to verify your identity.
            </p>
            
            <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center mb-6">
              {idDocument ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-accent/20 rounded-full flex items-center justify-center mb-4">
                    <Check size={24} className="text-accent" />
                  </div>
                  <p className="text-primary mb-2">{idDocument.name}</p>
                  <p className="text-secondary text-sm mb-4">
                    {(idDocument.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIdDocument(null)}
                  >
                    Remove and upload again
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer">
                  <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mb-4">
                    <Upload size={24} className="text-accent" />
                  </div>
                  <p className="text-primary mb-2">Click to upload your ID document</p>
                  <p className="text-secondary text-sm mb-6">
                    Accepted formats: JPG, PNG, PDF (max. 10MB)
                  </p>
                  <Button variant="secondary" size="sm">
                    Select File
                  </Button>
                  <input
                    type="file"
                    className="hidden"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={(e) => handleFileChange(e, 'id')}
                  />
                </label>
              )}
            </div>
          </div>
        );
        
      case 2: // Residence Verification
        return (
          <div>
            <h2 className="font-display text-2xl mb-4">Proof of Residence</h2>
            <p className="text-secondary mb-6">
              Please upload a document that verifies your current residential address.
            </p>
            
            <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center mb-6">
              {residenceDocument ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-accent/20 rounded-full flex items-center justify-center mb-4">
                    <Check size={24} className="text-accent" />
                  </div>
                  <p className="text-primary mb-2">{residenceDocument.name}</p>
                  <p className="text-secondary text-sm mb-4">
                    {(residenceDocument.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setResidenceDocument(null)}
                  >
                    Remove and upload again
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer">
                  <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mb-4">
                    <Upload size={24} className="text-accent" />
                  </div>
                  <p className="text-primary mb-2">Click to upload your proof of residence</p>
                  <p className="text-secondary text-sm mb-6">
                    Utility bill, bank statement, or government correspondence from the last 3 months
                  </p>
                  <Button variant="secondary" size="sm">
                    Select File
                  </Button>
                  <input
                    type="file"
                    className="hidden"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={(e) => handleFileChange(e, 'residence')}
                  />
                </label>
              )}
            </div>
          </div>
        );
        
      case 3: // Initial Deposit
        return (
          <div>
            <h2 className="font-display text-2xl mb-4">Initial Deposit</h2>
            <p className="text-secondary mb-6">
              Choose your initial deposit amount. You'll receive 5% USDT cashback on this amount.
            </p>
            
            <Card className="mb-6">
              <div className="space-y-6">
                <div>
                  <Input
                    label="Deposit Amount (CHF)"
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                    min="0"
                    max={selectedTier === 'signature' ? '500000' : '100000'}
                  />
                  <p className="text-secondary text-sm mt-2">
                    Maximum deposit: {selectedTier === 'signature' ? '500,000' : '100,000'} CHF
                  </p>
                </div>

                <div className="p-4 bg-surface rounded-lg">
                  <h3 className="font-medium mb-2">USDT Cashback Preview</h3>
                  <p className="text-2xl font-display text-accent">
                    {calculateCashback(depositAmount).toFixed(2)} USDT
                  </p>
                  <p className="text-secondary text-sm mt-2">
                    5% cashback will be credited to your USDT wallet
                  </p>
                </div>
              </div>
            </Card>
          </div>
        );
        
      case 4: // Completion
        return (
          <div className="text-center">
            <div className="w-20 h-20 bg-accent/20 rounded-full mx-auto flex items-center justify-center mb-6">
              <Check size={40} className="text-accent" />
            </div>
            
            <h2 className="font-display text-3xl mb-4">Verification in Progress</h2>
            <p className="text-secondary mb-8 max-w-md mx-auto">
              Thank you for completing the verification process. Our team is reviewing your information.
            </p>
            
            <Card className="mb-8">
              <div className="space-y-4 p-4">
                <div className="flex justify-between items-center">
                  <span>Selected Account</span>
                  <span className="text-accent">{selectedTier === 'signature' ? 'Signature' : 'Essential'}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span>Initial Deposit</span>
                  <span className="text-accent">{depositAmount.toFixed(2)} CHF</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span>USDT Cashback</span>
                  <span className="text-accent">{calculateCashback(depositAmount).toFixed(2)} USDT</span>
                </div>
              </div>
            </Card>
            
            <p className="text-sm text-secondary">
              You'll receive an email with further instructions once your account is verified.
            </p>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="container-custom py-6">
        <Logo size="md" />
      </div>
      
      <div className="container-custom flex-grow py-12">
        <div className="max-w-3xl mx-auto">
          {/* Progress steps */}
          <div className="mb-12">
            <div className="flex justify-between">
              {steps.map((step, index) => (
                <div key={index} className="flex flex-col items-center relative">
                  <div 
                    className={`w-8 h-8 rounded-full flex items-center justify-center z-10 
                      ${index < currentStep 
                        ? 'bg-accent text-background' 
                        : index === currentStep 
                          ? 'bg-surface-hover border-2 border-accent' 
                          : 'bg-surface-hover text-secondary'
                      }`}
                  >
                    {index < currentStep ? (
                      <Check size={16} />
                    ) : (
                      <span className="text-sm">{index + 1}</span>
                    )}
                  </div>
                  <span 
                    className={`text-xs mt-2 ${
                      index <= currentStep ? 'text-primary' : 'text-secondary'
                    }`}
                  >
                    {step}
                  </span>
                  
                  {index < steps.length - 1 && (
                    <div 
                      className={`absolute top-4 left-8 w-[calc(100%-32px)] h-0.5 
                        ${index < currentStep ? 'bg-accent' : 'bg-gray-800'}`}
                    ></div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="card shadow-lg"
          >
            {error && (
              <div className="mb-6 p-3 bg-error/10 border border-error/30 rounded-md text-error text-sm">
                {error}
              </div>
            )}
            
            {renderStepContent()}
            
            <div className="mt-8 flex justify-between">
              {currentStep > 0 && (
                <Button 
                  variant="ghost"
                  onClick={() => setCurrentStep(currentStep - 1)}
                  disabled={isLoading}
                >
                  Back
                </Button>
              )}
              
              <div className={currentStep === 0 ? 'w-full' : ''}>
                <Button
                  variant="primary"
                  onClick={handleContinue}
                  isLoading={isLoading}
                  fullWidth={currentStep === 0}
                  className="ml-auto"
                >
                  <span>
                    {currentStep === steps.length - 1 ? 'Go to Dashboard' : 'Continue'}
                  </span>
                  <ArrowRight size={16} className="ml-2" />
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default KycFlowPage;