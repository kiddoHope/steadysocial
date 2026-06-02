import React, { useState, useEffect, useRef } from 'react';

interface SearchableSelectProps {
  id?: string;
  label?: string;
  error?: string;
  options: { value: string | number; label: string }[];
  value: string | number;
  onChange: (value: string | number) => void;
  wrapperClassName?: string;
  className?: string;
  placeholder?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id,
  label,
  error,
  options,
  value,
  onChange,
  wrapperClassName = '',
  className = '',
  placeholder = 'Search...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const baseClasses = `
    mt-1 w-full px-4 py-3 bg-white 
    neo-border neo-shadow-sm font-bold text-neo-black
    focus-within:bg-neo-secondary focus-within:neo-shadow-md
    transition-all duration-100 flex items-center justify-between cursor-text
  `;
  const errorClasses = "bg-neo-accent/10 border-red-500 shadow-red-500/20";

  return (
    <div className={`mb-6 relative ${wrapperClassName}`} ref={wrapperRef}>
      {label && (
        <label htmlFor={id} className="block text-sm font-black uppercase tracking-widest text-neo-black mb-1">
          {label}
        </label>
      )}
      <div 
        className={`${baseClasses} ${error ? errorClasses : ''} ${className}`}
        onClick={() => setIsOpen(true)}
      >
        <input
          id={id}
          type="text"
          className="bg-transparent border-none outline-none w-full text-neo-black placeholder:text-neo-black/50"
          placeholder={selectedOption ? selectedOption.label : placeholder}
          value={isOpen ? searchTerm : (selectedOption ? selectedOption.label : '')}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchTerm('');
          }}
        />
        <i className={`fas fa-chevron-down text-neo-black text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full bg-white neo-border neo-shadow-md max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <div
                key={option.value}
                className={`px-4 py-3 cursor-pointer font-bold border-b-2 border-neo-black/10 last:border-b-0 hover:bg-neo-secondary hover:translate-x-1 transition-transform ${
                  value === option.value ? 'bg-neo-secondary text-neo-black' : 'text-neo-black'
                }`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  setSearchTerm('');
                }}
              >
                {option.label}
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-neo-black/50 font-bold uppercase text-xs">
              No results found
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-2 bg-neo-accent text-white px-3 py-1 neo-border-sm text-xs font-black uppercase tracking-widest inline-block">
          {error}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
