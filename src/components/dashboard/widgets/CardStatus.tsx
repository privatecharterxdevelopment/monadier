import React from 'react';
import { motion } from 'framer-motion';
import Card from '../../ui/Card';
import { useAuth } from '../../../contexts/AuthContext';

interface CardStatusProps {
  cardType: 'signature' | 'essential';
  shippingStatus: 'processing' | 'shipped' | 'delivered';
  estimatedDelivery?: string;
}

const CardStatus: React.FC<CardStatusProps> = ({ 
  cardType,
  shippingStatus,
  estimatedDelivery
}) => {
  const { profile } = useAuth();
  const isSignature = cardType === 'signature' || profile?.membership_tier === 'signature';
  
  return (
    <Card className="p-6">
      <h3 className="text-secondary font-medium text-sm mb-4">Monadier Card</h3>
      
      <div className="relative h-44 w-full rounded-xl overflow-hidden mb-6">
        <div 
          className={`absolute inset-0 ${
            isSignature ? 'bg-black' : 'bg-gray-700'
          }`}
        ></div>
        
        {/* Gold accent element */}
        <div 
          className={`absolute top-[15%] -right-6 w-16 h-32 rounded-full ${
            isSignature ? 'bg-white/15' : 'bg-gray-600'
          } blur-xl`}
        ></div>
        
        <div className="absolute inset-0 p-4 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center">
              <div className="w-10 h-6 rounded-md bg-white/5"></div>
              <div className="text-xs uppercase">
                {isSignature ? 'Signature' : 'Essential'}
              </div>
            </div>
          </div>
          
          <div>
            <div className="text-xs text-secondary mb-2">Card Number</div>
            <div className="flex space-x-2 text-lg">
              <span>••••</span>
              <span>••••</span>
              <span>••••</span>
              <span>4792</span>
            </div>
            
            <div className="mt-4 flex justify-between items-center">
              <div>
                <div className="text-xs text-secondary">VALID THRU</div>
                <div className="text-sm">05/28</div>
              </div>
              <div>
                <div className="text-xs text-secondary">CVV</div>
                <div className="text-sm">•••</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-white/10"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-secondary text-sm">Card Status</span>
          <div className="flex items-center">
            <div 
              className={`w-2 h-2 rounded-full mr-2 ${
                shippingStatus === 'delivered' ? 'bg-success' : 
                shippingStatus === 'shipped' ? 'bg-warning' : 'bg-accent'
              }`}
            ></div>
            <span className="text-primary text-sm capitalize">{shippingStatus}</span>
          </div>
        </div>
        
        {estimatedDelivery && (
          <div className="flex justify-between items-center">
            <span className="text-secondary text-sm">Estimated Delivery</span>
            <span className="text-primary text-sm">{estimatedDelivery}</span>
          </div>
        )}
        
        {shippingStatus !== 'delivered' && (
          <div className="w-full h-2 bg-surface rounded-full overflow-hidden mt-4">
            <motion.div 
              className={`h-full ${
                shippingStatus === 'shipped' ? 'bg-warning' : 'bg-accent'
              }`}
              initial={{ width: 0 }}
              animate={{ 
                width: shippingStatus === 'shipped' ? '65%' : '20%' 
              }}
              transition={{ duration: 1, ease: "easeOut" }}
            ></motion.div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CardStatus;