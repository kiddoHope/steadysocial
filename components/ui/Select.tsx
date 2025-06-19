import React from 'react';

// Explicitly define placeholder in props for custom logic
// Omit 'placeholder' from native attributes if it was ever considered part of them,
// but React.SelectHTMLAttributes<HTMLSelectElement> doesn't have it.
// The main goal is to type `placeholder` for our component's use and not spread it to the DOM if it's not a valid attribute.
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string | number; label: string }[];
  wrapperClassName?: string;
  placeholder?: string; // For the first disabled option logic
}

const Select: React.FC<SelectProps> = ({ 
  label, 
  id, 
  error, 
  options, 
  className = '', 
  wrapperClassName = '', 
  placeholder, // Destructure placeholder for logical use
  ...nativeSelectProps // Collect remaining valid HTMLSelectAttributes
}) => {
  const baseSelectClasses = "mt-1 block w-full pl-3 pr-10 py-2 text-base bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md text-slate-900 dark:text-slate-100";
  const errorSelectClasses = "border-red-500 focus:ring-red-500 focus:border-red-500";
  
  return (
    <div className={`mb-4 ${wrapperClassName}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`${baseSelectClasses} ${error ? errorSelectClasses : ''} ${className}`}
        {...nativeSelectProps} // Spread only native attributes
      >
        {/* Use the destructured placeholder for the conditional default option */}
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
};

export default Select;