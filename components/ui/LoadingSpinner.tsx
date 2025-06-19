
import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  color?: string; // e.g. 'text-primary-500'
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', className = '', color = 'text-primary-500' }) => {
  const sizeClasses = {
    sm: 'h-5 w-5',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className={`animate-spin rounded-full border-t-2 border-b-2 ${sizeClasses[size]} ${color} ${className}`} style={{borderTopColor: 'transparent'}}></div>
  );
};

export default LoadingSpinner;
    