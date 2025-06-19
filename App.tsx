
import React from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import GenerationPage from './pages/GenerationPage';
import SettingsPage from './pages/SettingsPage';
import HumanResourcePage from './pages/HumanResourcePage';
import NotFoundPage from './pages/NotFoundPage';
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import ChatbotFAB from './components/chatbot/ChatbotFAB'; // Added
import ChatWindow from './components/chatbot/ChatWindow'; // Added
import { useChatbot } from './contexts/ChatbotContext'; // Added
// Removed useAI import as it's not directly used for UI changes here now.
// Global loading state will be handled by components consuming useAI.

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  children?: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles, children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    // Redirect to dashboard if role not allowed, or to a specific "Access Denied" page
    return <Navigate to="/dashboard" replace />; 
  }
  
  return children ? <>{children}</> : <Outlet />;
};

const App: React.FC = () => {
  const { theme } = useTheme();
  const { currentUser, loading: authLoading } = useAuth(); // Renamed to avoid conflict if useAI had 'loading'
  const { isChatOpen } = useChatbot(); // Added to access isChatOpen in App

  React.useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // More robust initial loading state for auth
  if (authLoading && !sessionStorage.getItem('currentUser') && !localStorage.getItem('steadySocialAutoLoginUserId')) { 
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {currentUser && <Sidebar />}
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentUser && <Navbar />}
        <main className={`flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 ${!currentUser ? 'h-screen' : ''}`}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/generate" element={<ProtectedRoute allowedRoles={[UserRole.CREATIVE]}><GenerationPage /></ProtectedRoute>} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/hr" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><HumanResourcePage /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
      {currentUser && ( // Only show chatbot if user is logged in
        <>
          <ChatbotFAB />
          {isChatOpen && <ChatWindow />}
        </>
      )}
    </div>
  );
};

export default App;