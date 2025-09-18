import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: {
    value: number;
    type: 'increase' | 'decrease' | 'neutral';
  };
  icon: React.ElementType;
  iconColor?: string;
  loading?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  change,
  icon: Icon,
  iconColor = 'text-primary-600',
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 animate-pulse">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-24 mb-3"></div>
            <div className="h-8 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-20"></div>
          </div>
          <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className="bg-white rounded-xl shadow-md p-6 border border-gray-200 hover:border-primary-300 transition-all duration-200 cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-600 font-medium mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">{value}</h3>

          {(subtitle || change) && (
            <div className="flex items-center gap-2">
              {change && (
                <div
                  className={clsx('inline-flex items-center gap-1 text-sm font-medium', {
                    'text-green-600': change.type === 'increase',
                    'text-red-600': change.type === 'decrease',
                    'text-gray-500': change.type === 'neutral',
                  })}
                >
                  {change.type === 'increase' ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : change.type === 'decrease' ? (
                    <TrendingDown className="w-3 h-3" />
                  ) : null}
                  <span>
                    {change.value > 0 ? '+' : ''}
                    {change.value}%
                  </span>
                </div>
              )}
              {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
            </div>
          )}
        </div>

        <div className={clsx('w-12 h-12 rounded-lg flex items-center justify-center', 'bg-primary-50')}>
          <Icon className={clsx('w-6 h-6', iconColor)} />
        </div>
      </div>
    </motion.div>
  );
};

export default MetricCard;
