import React from 'react';
import { motion } from 'framer-motion';
import Card from '../../components/ui/Card';

const SettingsPage: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="font-display text-2xl mb-6">Settings</h2>
      
      <Card className="p-8 text-center">
        <h3 className="font-display text-xl mb-4">Account Settings</h3>
        <p className="text-secondary mb-4">
          Your account settings will be available once your account is fully verified.
        </p>
        
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/10"></div>
        </div>
        
        <p className="text-accent">Coming Soon</p>
      </Card>
    </motion.div>
  );
};

export default SettingsPage;