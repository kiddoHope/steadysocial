
import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { APP_NAME } from '../../constants';

const Navbar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b-8 border-neo-black sticky top-0 z-40 font-space">
      <div className="px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-neo-accent p-1.5 neo-border neo-shadow-sm -rotate-2">
            <i className="fas fa-bolt text-white"></i>
          </div>
          <Link to="/" className="text-2xl font-black uppercase tracking-tighter text-neo-black no-underline hover:text-neo-accent transition-colors">
            {APP_NAME}
          </Link>
        </div>
        
        <div className="flex items-center space-x-6">
          <button
            onClick={toggleTheme}
            className="w-10 h-10 neo-border bg-neo-secondary flex items-center justify-center neo-shadow-sm hover:neo-shadow-md transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <i className="fas fa-moon"></i> : <i className="fas fa-sun"></i>}
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;