import React from 'react';

// Define a more generic event handler type for onChange
type InputOrTextareaChangeEvent = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

// Base properties common to our custom Input component logic
interface BaseInputProps {
  label?: string;
  error?: string;
  wrapperClassName?: string;
  id?: string;
  className?: string;
  value?: string | number | readonly string[];
  onChange?: (event: InputOrTextareaChangeEvent) => void;
  // 'type' will determine rendering and can include 'textarea'
  type?: 'text' | 'password' | 'email' | 'number' | 'search' | 'tel' | 'url' | 'date' | 'time' | 'textarea' | string;
}

// Combine HTML attributes for input and textarea, omitting those handled by BaseInputProps
// or those that might conflict if not handled by 'type' logic.
// Rows is specific to textarea and is explicitly part of TextareaHTMLAttributes.
type ElementSpecificAttributes = 
  Omit<React.InputHTMLAttributes<HTMLInputElement>, keyof BaseInputProps | 'type'> &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, keyof BaseInputProps | 'rows'> & 
  { rows?: number }; // Ensure rows is available

export interface InputProps extends BaseInputProps, ElementSpecificAttributes {}

const Input = React.forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(({ 
  label, 
  id, 
  error, 
  className = '', 
  wrapperClassName = '', 
  type = 'text', // Default to text input
  rows, 
  value,
  onChange,
  ...rest // Remaining specific attributes for input or textarea
}, ref) => {
  const baseInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-slate-900 dark:text-slate-100";
  const errorInputClasses = "border-red-500 focus:ring-red-500 focus:border-red-500";
  
  const appliedClassName = `${baseInputClasses} ${error ? errorInputClasses : ''} ${className}`;

  return (
    <div className={`mb-4 ${wrapperClassName}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}
      {type === 'textarea' ? (
        <textarea
          id={id}
          rows={rows}
          value={value}
          onChange={onChange}
          className={appliedClassName}
          ref={ref as React.Ref<HTMLTextAreaElement>} // Cast ref for textarea
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} 
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          className={appliedClassName}
          ref={ref as React.Ref<HTMLInputElement>} // Cast ref for input
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});

Input.displayName = 'Input'; // Adding displayName for better debugging

export default Input;