
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  titleClassName?: string;
  actions?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, titleClassName = '', actions }) => {
  return (
    <div className={`bg-white dark:bg-slate-800 shadow-lg rounded-xl overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          {title && <h3 className={`text-lg font-semibold text-slate-800 dark:text-slate-100 ${titleClassName}`}>{title}</h3>}
          {actions && <div className="flex items-center space-x-2">{actions}</div>}
        </div>
      )}
      <div className="p-4 sm:p-6">
        {children}
      </div>
    </div>
  );
};

export default Card;
    