import React, { useEffect } from 'react';

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
  className?: string;
}

const Alert: React.FC<AlertProps> = ({ type, message, onClose, className = '' }) => {
  useEffect(() => {
    if (onClose) {
      const timer = setTimeout(() => {
        onClose();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [message, type, onClose]);

  const alertStyles = {
    success: 'bg-green-500 text-white',
    error: 'bg-neo-accent text-white',
    warning: 'bg-neo-secondary text-neo-black',
    info: 'bg-neo-muted text-neo-black',
  };

  const iconClasses = {
    success: 'fas fa-check-circle',
    error: 'fas fa-skull-crossbones',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-bolt',
  }

  return (
    <div
      className={`
        neo-border p-5 my-6 neo-shadow-sm flex items-start 
        ${alertStyles[type]} ${className}
      `}
      role="alert"
    >
      <div className="mr-4 text-2xl">
        <i className={`${iconClasses[type]}`}></i>
      </div>
      <div className="flex-grow">
        <p className="font-black uppercase tracking-widest text-sm mb-1 opacity-80">
          {type === 'error' ? 'SYSTEM FAILURE' : type.toUpperCase()}
        </p>
        <p className="font-bold text-lg leading-snug">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 neo-border-sm bg-white text-neo-black p-1 w-8 h-8 flex items-center justify-center hover:bg-neo-secondary transition-colors"
          aria-label="Dismiss"
        >
          <i className="fas fa-times"></i>
        </button>
      )}
    </div>
  );
};

export default Alert;
