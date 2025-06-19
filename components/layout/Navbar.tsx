
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { APP_NAME } from '../../constants';
import Button from '../ui/Button';

const Navbar: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-white dark:bg-slate-800 shadow-md sticky top-0 z-50">
      <div className="px-4 py-3 flex justify-between items-center">
        <div className="flex justify-center items-center">
          <i className="fas fa-feather-alt text-[1vw] text-primary-500 dark:text-primary-400 mr-1"></i>
          <Link to="/dashboard" className="text-xl font-semibold text-primary-600 dark:text-primary-400">
            {APP_NAME}
          </Link>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <i className="fas fa-moon"></i> : <i className="fas fa-sun"></i>}
          </button>
          {currentUser && (
            <div className="relative group">
               <span className="text-sm text-slate-700 dark:text-slate-300 hidden sm:inline">
                {currentUser.username} ({currentUser.role})
              </span>
              <Button onClick={handleLogout} variant="secondary" size="sm" className="ml-2">
                <i className="fas fa-sign-out-alt mr-1 sm:mr-2"></i>
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;