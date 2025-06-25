
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth, UserRole } from '../../contexts/AuthContext';

interface NavItemProps {
  to: string;
  icon: string;
  label: string;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label }) => (
  <NavLink
    to={to}
    className={({ isActive }) => ( 
      `flex items-center px-4 py-3 my-1 text-sm hover:bg-primary-500 hover:text-white dark:hover:bg-primary-700 rounded-lg transition-colors duration-150 ${
        isActive ? 'bg-primary-500 text-white dark:bg-primary-700' : 'text-slate-700 dark:text-slate-300'
      }`
    )}
  >
    <i className={`fas ${icon} w-5 mr-3`}></i>
    {label}
  </NavLink>
);

const Sidebar: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <aside className="w-64 bg-white dark:bg-slate-800 shadow-lg p-4 space-y-2 flex-shrink-0 h-full overflow-y-auto">
      <nav>
        <NavItem to="/dashboard" icon="fa-tachometer-alt" label="Dashboard" />
        {currentUser?.role === UserRole.CREATIVE && (
          <NavItem to="/generate" icon="fa-magic" label="Content Canvas" /> 
        )}
        <NavItem to="/analytics" icon="fa-chart-line" label="Analytics" />
        <NavItem to="/facebook-chats" icon="fa-comments" label="Facebook Chats" /> {/* Added Facebook Chats Link */}
        <NavItem to="/settings" icon="fa-cog" label="Settings" />
        {currentUser?.role === UserRole.ADMIN && (
          <NavItem to="/hr" icon="fa-users-cog" label="Human Resources" />
        )}
      </nav>
    </aside>
  );
};

export default Sidebar;
