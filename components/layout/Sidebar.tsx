
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
      `flex items-center px-6 py-4 my-3 text-sm font-black uppercase tracking-wider transition-all duration-100 ${
        isActive 
          ? 'bg-neo-accent text-white neo-border neo-shadow-sm translate-x-[4px] translate-y-[4px]' 
          : 'text-neo-black hover:neo-border hover:bg-white hover:neo-shadow-sm'
      }`
    )}
  >
    <i className={`fas ${icon} text-lg mr-4`}></i>
    {label}
  </NavLink>
);

const Sidebar: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <aside className="w-72 bg-neo-bg border-r-8 border-neo-black p-6 flex-shrink-0 h-full overflow-y-auto font-space">
      <div className="mb-10 px-2">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-neo-black/40 mb-2">Main Navigation</div>
        <div className="h-1 bg-neo-black w-12"></div>
      </div>
      <nav className="space-y-1">
        <NavItem to="/dashboard" icon="fa-tachometer-alt" label="DASHBOARD" />
        <NavItem to="/board/default" icon="fa-th-large" label="BOARD" />
        <NavItem to="/marketing-os" icon="fa-rocket" label="MARKETING_OS" />
        <NavItem to="/campaign-planner" icon="fa-bullhorn" label="CAMPAIGNS" />
        <NavItem to="/planning" icon="fa-scroll" label="PLAN_WORKSPACE" />
        <NavItem to="/facebook-scheduler" icon="fa-calendar-alt" label="SCHEDULER" />
        <NavItem to="/messaging" icon="fa-comments" label="MESSAGING" />
        <NavItem to="/generate" icon="fa-magic" label="CANVAS_GEN" /> 
        <NavItem to="/presentation" icon="fa-sliders-h" label="PRESENTATIONS" />
        <NavItem to="/analytics" icon="fa-chart-line" label="ANALYTICS" />
        <NavItem to="/settings" icon="fa-cog" label="SETTINGS" />
        <NavItem to="/hr" icon="fa-users-cog" label="ADMIN_CORE" />
        <NavItem to="/about" icon="fa-info-circle" label="ABOUT_PROTOCOL" />
      </nav>

      <div className="mt-10 p-6 bg-neo-secondary neo-border neo-shadow-sm rotate-2">
        <h4 className="font-black uppercase text-xs mb-2 tracking-widest">System Status</h4>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse neo-border-sm"></div>
          <span className="text-[10px] font-black uppercase tracking-tight">AI Engine Ready</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
