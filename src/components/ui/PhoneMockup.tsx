import React from 'react';
import { motion } from 'framer-motion';

interface PhoneMockupProps {
  children: React.ReactNode;
}

const PhoneMockup: React.FC<PhoneMockupProps> = ({ children }) => {
  return (
    <div className="relative w-[320px] h-[650px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="absolute inset-0 bg-black rounded-[3rem] border-[14px] border-gray-900 shadow-2xl overflow-hidden"
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-40 bg-black rounded-b-3xl z-20"></div>
        
        {/* Screen Content */}
        <div className="relative h-full w-full bg-background overflow-hidden rounded-[2rem]">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

export default PhoneMockup;