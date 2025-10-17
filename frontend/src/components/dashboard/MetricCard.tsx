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
      <div className="bg-white rounded-lg sm:rounded-xl shadow-md p-3 sm:p-4 md:p-6 border border-gray-200 animate-pulse">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="h-3 sm:h-4 bg-gray-200 rounded w-16 sm:w-24 mb-2 sm:mb-3"></div>
            <div className="h-6 sm:h-8 bg-gray-200 rounded w-20 sm:w-32 mb-1 sm:mb-2"></div>
            <div className="h-2 sm:h-3 bg-gray-200 rounded w-14 sm:w-20"></div>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className="bg-white rounded-lg sm:rounded-xl shadow-sm hover:shadow-md p-3 sm:p-4 md:p-5 border border-gray-200 hover:border-primary-300 transition-all duration-200"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm text-gray-600 font-medium mb-0.5 sm:mb-1 truncate">{title}</p>
          <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">{value}</h3>

          {(subtitle || change) && (
            <div className="flex items-center gap-2">
              {change && (
                <div
                  className={clsx('inline-flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm font-medium', {
                    'text-green-600': change.type === 'increase',
                    'text-red-600': change.type === 'decrease',
                    'text-gray-500': change.type === 'neutral',
                  })}
                >
                  {change.type === 'increase' ? (
                    <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  ) : change.type === 'decrease' ? (
                    <TrendingDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  ) : null}
                  <span>
                    {change.value > 0 ? '+' : ''}
                    {change.value}%
                  </span>
                </div>
              )}
              {subtitle && <span className="text-xs text-gray-500 truncate">{subtitle}</span>}
            </div>
          )}
        </div>

        <div
          className={clsx(
            'w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center flex-shrink-0',
            'bg-gray-50'
          )}
        >
          <Icon className={clsx('w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6', iconColor)} />
        </div>
      </div>
    </motion.div>
  );
};

export default MetricCard;
