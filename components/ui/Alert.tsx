
import React from 'react';

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
  className?: string;
}

const Alert: React.FC<AlertProps> = ({ type, message, onClose, className = '' }) => {
  const alertStyles = {
    success: 'bg-green-100 border-green-400 text-green-700 dark:bg-green-900 dark:border-green-700 dark:text-green-300',
    error: 'bg-red-100 border-red-400 text-red-700 dark:bg-red-900 dark:border-red-700 dark:text-red-300',
    warning: 'bg-yellow-100 border-yellow-400 text-yellow-700 dark:bg-yellow-900 dark:border-yellow-700 dark:text-yellow-300',
    info: 'bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-300',
  };

  const iconClasses = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle',
  }

  return (
    <div
      className={`border-l-4 p-4 my-4 rounded-md shadow-sm flex items-start ${alertStyles[type]} ${className}`}
      role="alert"
    >
      <div className="mr-3">
        <i className={`${iconClasses[type]}`}></i>
      </div>
      <div className="flex-grow">
        <p className="font-medium">
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </p>
        <p className="text-sm">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-auto -mx-1.5 -my-1.5 p-1.5 rounded-lg focus:ring-2 focus:ring-opacity-50"
          aria-label="Dismiss"
        >
          <i className="fas fa-times"></i>
        </button>
      )}
    </div>
  );
};

export default Alert;
