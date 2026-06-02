import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className = '',
  ...props
}) => {
  const baseStyles = 'font-black uppercase tracking-wider neo-border transition-all duration-100 flex items-center justify-center relative active:translate-x-[2px] active:translate-y-[2px] active:shadow-none';

  const variantStyles = {
    primary: 'bg-neo-accent text-white neo-shadow-sm hover:neo-shadow-md',
    secondary: 'bg-neo-secondary text-neo-black neo-shadow-sm hover:neo-shadow-md',
    danger: 'bg-red-500 text-white neo-shadow-sm hover:neo-shadow-md',
    success: 'bg-green-500 text-white neo-shadow-sm hover:neo-shadow-md',
    warning: 'bg-neo-secondary text-neo-black neo-shadow-sm hover:neo-shadow-md',
    ghost: 'bg-transparent border-transparent hover:neo-border hover:bg-white hover:neo-shadow-sm',
  };

  const sizeStyles = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
    xl: 'px-10 py-5 text-xl',
  };

  const disabledStyles = 'opacity-50 cursor-not-allowed grayscale';

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${props.disabled || isLoading ? disabledStyles : ''} ${className}`}
      disabled={props.disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="mr-3 animate-spin w-5 h-5 border-4 border-white border-t-transparent"></div>
      ) : icon ? <span className="mr-3 text-lg">{icon}</span> : null}
      {children}
    </button>
  );
};

export default Button;