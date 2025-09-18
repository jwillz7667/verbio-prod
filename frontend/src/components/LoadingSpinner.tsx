import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fullScreen?: boolean;
  message?: string;
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  fullScreen = false,
  message,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
    xl: 'h-16 w-16 border-4',
  };

  const spinner = (
    <div className={`${sizeClasses[size]} border-violet-600 border-t-transparent rounded-full animate-spin`} />
  );

  if (fullScreen) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-50"
      >
        <div className="flex flex-col items-center gap-4">
          {spinner}
          {message && (
            <p className="text-gray-600 text-sm font-medium animate-pulse">
              {message}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="flex flex-col items-center gap-2">
        {spinner}
        {message && (
          <p className="text-gray-600 text-sm">
            {message}
          </p>
        )}
      </div>
    </div>
  );
};

export default LoadingSpinner;