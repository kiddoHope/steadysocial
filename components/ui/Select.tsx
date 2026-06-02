import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string | number; label: string }[];
  wrapperClassName?: string;
  placeholder?: string;
}

const Select: React.FC<SelectProps> = ({ 
  label, 
  id, 
  error, 
  options, 
  className = '', 
  wrapperClassName = '', 
  placeholder,
  ...nativeSelectProps
}) => {
  const baseSelectClasses = `
    mt-1 block w-full px-4 py-3 bg-white 
    neo-border neo-shadow-sm font-bold text-neo-black
    focus:bg-neo-secondary focus:neo-shadow-md focus:outline-none focus:ring-0
    transition-all duration-100 cursor-pointer appearance-none
    bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22square%22%20stroke-linejoin%3D%22miter%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')]
    bg-[length:20px_20px] bg-[right_1rem_center] bg-no-repeat
  `;
  const errorSelectClasses = "bg-neo-accent/10 border-red-500 shadow-red-500/20";
  
  return (
    <div className={`mb-6 ${wrapperClassName}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-black uppercase tracking-widest text-neo-black mb-1">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`${baseSelectClasses} ${error ? errorSelectClasses : ''} ${className}`}
        {...nativeSelectProps}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(option => (
          <option key={option.value} value={option.value} className="font-bold">
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <div className="mt-2 bg-neo-accent text-white px-3 py-1 neo-border-sm text-xs font-black uppercase tracking-widest inline-block">
          {error}
        </div>
      )}
    </div>
  );
};

export default Select;