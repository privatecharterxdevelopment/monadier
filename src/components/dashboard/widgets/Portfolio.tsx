import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import Card from '../../ui/Card';
import { formatCurrency } from '../../../utils/formatters';

interface MetalHolding {
  type: 'gold' | 'silver';
  grams: number;
  value: number;
  change: number;
}

interface PortfolioProps {
  metals: MetalHolding[];
  totalValue: number;
}

const Portfolio: React.FC<PortfolioProps> = ({ metals, totalValue }) => {
  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-secondary font-medium text-sm">Precious Metals</h3>
        <div className="text-accent text-sm">View All</div>
      </div>
      
      <div className="mb-5">
        <h4 className="text-lg font-display mb-1">{formatCurrency(totalValue)}</h4>
        <p className="text-secondary text-sm">Total holdings value</p>
      </div>
      
      <div className="space-y-4">
        {metals.map((metal, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex items-center">
              <div 
                className={`w-10 h-10 rounded-full ${
                  metal.type === 'gold' ? 'bg-white/10' : 'bg-gray-500/20'
                } flex items-center justify-center mr-3`}
              >
                <span 
                  className={metal.type === 'gold' ? 'text-accent' : 'text-gray-400'}
                >
                  {metal.type === 'gold' ? 'Au' : 'Ag'}
                </span>
              </div>
              
              <div>
                <p className="font-medium capitalize">{metal.type}</p>
                <p className="text-secondary text-sm">{metal.grams} grams</p>
              </div>
            </div>
            
            <div className="text-right">
              <p>{formatCurrency(metal.value)}</p>
              <p className={`text-sm flex items-center justify-end ${
                metal.change >= 0 ? 'text-success' : 'text-error'
              }`}>
                {metal.change >= 0 ? '+' : ''}{metal.change}%
                {metal.change >= 0 && <ArrowUpRight size={14} className="ml-1" />}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default Portfolio;