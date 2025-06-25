
import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import useWebLLM from '../hooks/useWebLLM';
import { SocialPlatform } from '../types'; // Removed CaptionTone as it's not directly used here
import LoadingSpinner from '../components/ui/LoadingSpinner';

interface AIContextType {
  creativeModelLoaded: boolean;
  creativeModelProgress: string;
  chatbotModelLoaded: boolean;
  chatbotModelProgress: string;
  isLoadingInitialItems: boolean;
  isLoadingChatMessage: boolean;
  isLoadingAdaptation: Record<string, Partial<Record<SocialPlatform, boolean>>>;
  isLoadingPromptSuggestion: boolean;
  error: string | null;
  rawAIResponse: string | null;
  requestType: string | null;
  suggestAIPrompt: string | null;
  generateInitialCanvasItems: (props: any) => Promise<string[]>;
  adaptCanvasItem: (props: any) => Promise<string>;
  suggestPromptForCanvasTitle: (title: string) => Promise<string>;
  setError: (error: string | null) => void;
  generateChatResponse: (props: {
    userMessage: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    onChunk: (chunk: string) => void;
  }) => Promise<string>;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const webLLMValues = useWebLLM();
  const { creativeModelLoaded, chatbotModelLoaded, creativeModelProgress, chatbotModelProgress, error } = webLLMValues;

  const [showLoader, setShowLoader] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (creativeModelLoaded && chatbotModelLoaded) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        setShowLoader(false);
      }, 500); // Animation duration
      return () => clearTimeout(timer);
    }
  }, [creativeModelLoaded, chatbotModelLoaded]);

  // If one model loads and the other has an error, hide the loader after a delay
  // to allow the error message to be seen or for the app to proceed if only one model is critical.
  useEffect(() => {
    if (error && (creativeModelLoaded || chatbotModelLoaded)) {
      // If there's an error and at least one model has finished its attempt (loaded or failed)
      // We might want to hide the loader sooner or based on which model failed.
      // For now, if both attempts are done (one loaded, one error), proceed like normal loading.
      if ((creativeModelLoaded || creativeModelProgress.includes("Error")) && 
          (chatbotModelLoaded || chatbotModelProgress.includes("Error"))) {
            setIsExiting(true);
            const timer = setTimeout(() => {
                setShowLoader(false);
            }, 500);
            return () => clearTimeout(timer);
          }
    }
  }, [error, creativeModelLoaded, chatbotModelLoaded, creativeModelProgress, chatbotModelProgress]);


  return (
    <AIContext.Provider value={webLLMValues}>
      {showLoader && (
        <div
          className={`
            fixed top-10 right-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 
            rounded-lg shadow-xl p-4 w-full max-w-sm z-[9999]
            ${isExiting ? 'animate-slide-out-to-right' : 'animate-slide-in-from-right'}
          `}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center mb-2">
            <LoadingSpinner size="sm" className={creativeModelLoaded ? "text-green-500" : (creativeModelProgress.includes("Error") ? "text-red-500" : "")} />
            <div className="ml-3 flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Creative AI Engine
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                {creativeModelProgress || (creativeModelLoaded ? 'Ready' : 'Initializing...')}
              </p>
            </div>
          </div>
          <div className="flex items-center">
            <LoadingSpinner size="sm" className={chatbotModelLoaded ? "text-green-500" : (chatbotModelProgress.includes("Error") ? "text-red-500" : "")} />
            <div className="ml-3 flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Chatbot AI Engine
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                {chatbotModelProgress || (chatbotModelLoaded ? 'Ready' : 'Initializing...')}
              </p>
            </div>
          </div>
           {error && !isExiting && ( // Show general error if present and loader is still visible
            <p className="text-xs text-red-500 mt-2 pt-2 border-t border-red-200 dark:border-red-700">{error}</p>
          )}
        </div>
      )}
      {children}
    </AIContext.Provider>
  );
};

export const useAI = (): AIContextType => {
  const context = useContext(AIContext);
  if (context === undefined) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};