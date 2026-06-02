import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  title?: string;
  titleClassName?: string;
  actions?: React.ReactNode;
  variant?: 'default' | 'accent' | 'secondary' | 'muted';
  hoverEffect?: boolean;
}

const Card: React.FC<CardProps> = ({ 
  children, 
  className = '', 
  title, 
  titleClassName = '', 
  actions, 
  variant = 'default',
  hoverEffect = false,
  ...rest 
}) => {
  const variantClasses = {
    default: 'bg-white',
    accent: 'bg-neo-accent text-white',
    secondary: 'bg-neo-secondary',
    muted: 'bg-neo-muted',
  };

  return (
    <div 
      className={`
        neo-border neo-shadow-md overflow-hidden transition-all duration-200
        ${variantClasses[variant]}
        ${hoverEffect ? 'hover:-translate-y-1 hover:neo-shadow-lg' : ''}
        ${className}
      `} 
      {...rest}
    >
      {(title || actions) && (
        <div className={`
          p-4 sm:p-5 border-b-4 border-neo-black flex justify-between items-center
          ${variant === 'accent' ? 'bg-neo-black/10' : 'bg-neo-black/5'}
        `}>
          {title && (
            <h3 className={`text-xl font-black uppercase tracking-tight text-neo-black ${titleClassName}`}>
              {title}
            </h3>
          )}
          {actions && <div className="flex items-center space-x-2">{actions}</div>}
        </div>
      )}
      <div className="p-4 sm:p-6 font-bold">
        {children}
      </div>
    </div>
  );
};

export default Card;
