
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AIProvider } from './contexts/AIContext';
import { ChatbotProvider } from './contexts/ChatbotContext'; // Added ChatbotProvider
import { AnalyticsProvider } from './contexts/AnalyticsContext'; // Added AnalyticsProvider
import { HashRouter } from 'react-router-dom';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <AuthProvider>
          <AIProvider>
            <ChatbotProvider> {/* Added ChatbotProvider wrapper */}
              <AnalyticsProvider> {/* Added AnalyticsProvider wrapper */}
                <App />
              </AnalyticsProvider>
            </ChatbotProvider>
          </AIProvider>
        </AuthProvider>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>
);