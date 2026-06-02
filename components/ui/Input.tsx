import React from 'react';

type InputOrTextareaChangeEvent = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

interface BaseInputProps {
  label?: string;
  error?: string;
  wrapperClassName?: string;
  id?: string;
  className?: string;
  value?: string | number | readonly string[];
  onChange?: (event: InputOrTextareaChangeEvent) => void;
  type?: 'text' | 'password' | 'email' | 'number' | 'search' | 'tel' | 'url' | 'date' | 'time' | 'textarea' | string;
}

type ElementSpecificAttributes = 
  Omit<React.InputHTMLAttributes<HTMLInputElement>, keyof BaseInputProps | 'type'> &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, keyof BaseInputProps | 'rows'> & 
  { rows?: number };

export interface InputProps extends BaseInputProps, ElementSpecificAttributes {}

const Input = React.forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(({ 
  label, 
  id, 
  error, 
  className = '', 
  wrapperClassName = '', 
  type = 'text',
  rows, 
  value,
  onChange,
  ...rest
}, ref) => {
  const baseInputClasses = `
    mt-1 block w-full px-4 py-3 bg-white 
    neo-border neo-shadow-sm font-bold text-neo-black
    placeholder:text-neo-black/40
    focus:bg-neo-secondary focus:neo-shadow-md focus:outline-none focus:ring-0
    transition-all duration-100
  `;
  const errorInputClasses = "bg-neo-accent/10 border-red-500 shadow-red-500/20";
  
  const appliedClassName = `${baseInputClasses} ${error ? errorInputClasses : ''} ${className}`;

  return (
    <div className={`mb-6 ${wrapperClassName}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-black uppercase tracking-widest text-neo-black mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {type === 'textarea' ? (
          <textarea
            id={id}
            rows={rows}
            value={value}
            onChange={onChange}
            className={appliedClassName}
            ref={ref as React.Ref<HTMLTextAreaElement>}
            {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} 
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value}
            onChange={onChange}
            className={appliedClassName}
            ref={ref as React.Ref<HTMLInputElement>}
            {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
      </div>
      {error && (
        <div className="mt-2 bg-neo-accent text-white px-3 py-1 neo-border-sm text-xs font-black uppercase tracking-widest inline-block">
          {error}
        </div>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;