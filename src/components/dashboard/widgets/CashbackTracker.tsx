import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import Card from '../../ui/Card';
import { formatCurrency } from '../../../utils/formatters';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface CashbackTrackerProps {
  totalCashback: number;
  percentage: number;
  monthlyData: {
    month: string;
    amount: number;
  }[];
}

const CashbackTracker: React.FC<CashbackTrackerProps> = ({
  totalCashback,
  percentage,
  monthlyData
}) => {
  const chartData = {
    labels: monthlyData.map(item => item.month),
    datasets: [
      {
        label: 'Cashback',
        data: monthlyData.map(item => item.amount),
        borderColor: '#d4af37',
        backgroundColor: 'rgba(212, 175, 55, 0.1)',
        borderWidth: 2,
        pointBackgroundColor: '#d4af37',
        pointBorderColor: '#141414',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: '#1a1a1a',
        titleColor: '#ffffff',
        bodyColor: '#bbbbbb',
        borderColor: '#333333',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: function(context: any) {
            return `${formatCurrency(context.raw)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false,
          drawBorder: false
        },
        ticks: {
          color: '#bbbbbb',
          font: {
            size: 10
          }
        }
      },
      y: {
        grid: {
          color: 'rgba(187, 187, 187, 0.1)',
          drawBorder: false
        },
        ticks: {
          color: '#bbbbbb',
          font: {
            size: 10
          },
          callback: function(value: any) {
            return formatCurrency(value);
          }
        }
      }
    }
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-secondary font-medium text-sm">Cashback Rewards</h3>
        <div className="bg-accent/10 text-accent px-2 py-1 rounded text-xs">
          {percentage}% Rate
        </div>
      </div>
      
      <div className="mb-5">
        <h4 className="text-lg font-display mb-1">{formatCurrency(totalCashback)}</h4>
        <p className="text-secondary text-sm">Total cashback earned</p>
      </div>
      
      <div className="h-48 w-full">
        <Line data={chartData} options={chartOptions as any} />
      </div>
    </Card>
  );
};

export default CashbackTracker;