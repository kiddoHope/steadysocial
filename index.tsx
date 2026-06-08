
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AIProvider } from './contexts/AIContext';
import { ChatbotProvider } from './contexts/ChatbotContext';
import { AnalyticsProvider } from './contexts/AnalyticsContext';
import { CanvasProvider } from './contexts/CanvasContext'; // Added CanvasProvider
import { GenerationWIPProvider } from './contexts/GenerationWIPContext'; // Added GenerationWIPProvider
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { MarketResearchProvider } from './contexts/MarketResearchContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Router>
      <AuthProvider> {/* AuthProvider now wraps ThemeProvider */}
        <ThemeProvider>
          <AIProvider>
            <CanvasProvider>
              <GenerationWIPProvider>
                <ChatbotProvider>
                  <AnalyticsProvider>
                    <MarketResearchProvider>
                      <App />
                    </MarketResearchProvider>
                  </AnalyticsProvider>
                </ChatbotProvider>
              </GenerationWIPProvider>
            </CanvasProvider>
          </AIProvider>
        </ThemeProvider>
      </AuthProvider>
    </Router>
  </React.StrictMode>
);