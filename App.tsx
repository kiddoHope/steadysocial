
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
import TermsPage from './pages/TermsPage'; 
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'; 
import AboutUsPage from './pages/AboutUsPage'; 
import AnalyticsPage from './pages/AnalyticsPage'; 
import FacebookChatsPage from './pages/FacebookChatsPage';
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import ChatbotFAB from './components/chatbot/ChatbotFAB'; 
import ChatWindow from './components/chatbot/ChatWindow'; 
import { useChatbot } from './contexts/ChatbotContext'; 
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPassword';
import VerifyEmailPage from './pages/VerifyEmailPage'; // Import the new page
import LandingPage from './pages/Landing';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  children?: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles, children }) => {
  const { currentUser, initialAuthCheckComplete } = useAuth(); // Use initialAuthCheckComplete
  const location = useLocation();

  if (!initialAuthCheckComplete) { // Wait for initial auth check
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
    return <Navigate to="/dashboard" replace />; 
  }
  
  return children ? <>{children}</> : <Outlet />;
};

const App: React.FC = () => {
  const { theme, isLoadingTheme } = useTheme();
  const { currentUser, initialAuthCheckComplete } = useAuth(); // Use initialAuthCheckComplete
  const { isChatOpen } = useChatbot(); 

  React.useEffect(() => {
    // Theme application is now handled within ThemeContext based on its loading state
    if (!isLoadingTheme) {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }
  }, [theme, isLoadingTheme]);

  // Show a global loader until initial auth status and theme are resolved
  if (!initialAuthCheckComplete || isLoadingTheme) { 
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary-500"></div>
        <p className="ml-4 text-slate-700 dark:text-slate-200">Initializing Application...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {currentUser && <Sidebar />}
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentUser && <Navbar />}
        <main className={`flex-1 overflow-x-hidden overflow-y-auto ${!currentUser ? 'h-screen' : ''}`}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/about" element={<AboutUsPage />} />
            
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/generate" element={<ProtectedRoute allowedRoles={[UserRole.CREATIVE]}><GenerationPage /></ProtectedRoute>} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/facebook-chats" element={<FacebookChatsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/hr" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><HumanResourcePage /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
      {currentUser && ( 
        <>
          <ChatbotFAB />
          {isChatOpen && <ChatWindow />}
        </>
      )}
    </div>
  );
};

export default App;
