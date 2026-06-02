import React, { useState } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useTheme } from './contexts/ThemeContext';
import DashboardPage from './pages/DashboardPage';
import BoardPage from './pages/BoardPage';
import GenerationPage from './pages/GenerationPage';
import SettingsPage from './pages/SettingsPage';
import HumanResourcePage from './pages/HumanResourcePage';
import NotFoundPage from './pages/NotFoundPage';
import TermsPage from './pages/TermsPage'; 
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'; 
import AboutUsPage from './pages/AboutUsPage'; 
import AnalyticsPage from './pages/AnalyticsPage'; 
import MessagingPage from './pages/MessagingPage';
import MarketingOSPage from './pages/MarketingOSPage';
import FacebookSchedulerPage from './pages/FacebookSchedulerPage';
import CampaignPlannerPage from './pages/CampaignPlannerPage';
import LeadCorePage from './pages/LeadCorePage';
import AutomationMatrixPage from './pages/AutomationMatrixPage';
import PlanningPage from './pages/PlanningPage';
import PresentationPage from './pages/PresentationPage';
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import ChatbotFAB from './components/chatbot/ChatbotFAB'; 
import ChatWindow from './components/chatbot/ChatWindow'; 
import { useChatbot } from './contexts/ChatbotContext'; 
import MessengerBackgroundHub from './components/MessengerBackgroundHub';

// BoardPageWrapper moved outside App to fix the syntax error
const BoardPageWrapper: React.FC = () => {
  const { boardId } = useParams();
  return <BoardPage workspace={boardId || 'default'} />;
};

const App: React.FC = () => {
  const { theme, isLoadingTheme } = useTheme();
  const { isChatOpen } = useChatbot(); 

  // State for sidebar visibility
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Start open by default

  React.useEffect(() => {
    if (!isLoadingTheme) {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }
  }, [theme, isLoadingTheme]);

  if (isLoadingTheme) { 
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neo-bg text-neo-black font-space relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-10"></div>
        <div className="relative">
          <div className="w-24 h-24 neo-border bg-neo-accent animate-spin-slow neo-shadow-md"></div>
          <div className="absolute inset-0 flex items-center justify-center">
             <i className="fas fa-bolt text-3xl text-white"></i>
          </div>
        </div>
        <p className="mt-8 font-black text-2xl uppercase tracking-widest animate-pulse">Initializing System...</p>
      </div>
    );
  }

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  return (
    <div className="flex h-screen bg-neo-bg text-neo-black font-space overflow-hidden selection:bg-neo-accent selection:text-white">
      {/* Sidebar with conditional visibility and transition */}
      <aside className={`transition-all duration-300 ${isSidebarOpen ? 'w-auto' : 'hidden'} flex-shrink-0`}>
        {/* Assuming Sidebar component handles its internal layout, we just control the width here */}
        <Sidebar />
      </aside>

      {/* Main content area */}
      <div className={`flex-1 flex flex-col overflow-hidden relative`}>
        <div className="absolute inset-0 bg-grid opacity-5 pointer-events-none"></div>
        {/* Main content area starts here */}
        <main id="main-content" className="flex-1 overflow-x-hidden overflow-y-auto relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/generate" element={<GenerationPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/messaging" element={<MessagingPage />} />
            <Route path="/facebook-chats" element={<Navigate to="/messaging" replace />} />
            <Route path="/marketing-os" element={<MarketingOSPage />} />
            <Route path="/facebook-scheduler" element={<FacebookSchedulerPage />} />
            <Route path="/campaign-planner" element={<CampaignPlannerPage />} />
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/crm" element={<LeadCorePage />} />
            <Route path="/automation" element={<AutomationMatrixPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/hr" element={<HumanResourcePage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/about" element={<AboutUsPage />} />
            <Route path="/presentation" element={<PresentationPage />} />
            <Route path="/board" element={<Navigate to="/board/default" replace />} />
            <Route path="/board/:boardId" element={<BoardPageWrapper />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>

      {/* Floating button for toggling sidebar */}
      <div className="absolute top-4 left-4 z-40">
        <button 
          onClick={toggleSidebar} 
          className="p-2 bg-neo-accent text-white rounded-lg shadow-lg hover:bg-opacity-90 transition-colors focus:outline-none"
        >
          {/* Icon for collapse/expand, e.g., a hamburger menu or an arrow */}
          {isSidebarOpen ? '◀' : '▶'}
        </button>
      </div>

      <ChatbotFAB />
      {isChatOpen && <ChatWindow />}
      <MessengerBackgroundHub />
    </div>
  );
};

export default App;