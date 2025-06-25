
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

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider> {/* AuthProvider now wraps ThemeProvider */}
        <ThemeProvider>
          <AIProvider>
            <CanvasProvider>
              <GenerationWIPProvider>
                <ChatbotProvider>
                  <AnalyticsProvider>
                    <App />
                  </AnalyticsProvider>
                </ChatbotProvider>
              </GenerationWIPProvider>
            </CanvasProvider>
          </AIProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);