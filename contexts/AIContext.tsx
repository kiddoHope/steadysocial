import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react'; // Make sure useState and useEffect are imported
import useWebLLM from '../hooks/useWebLLM';
import { SocialPlatform, CaptionTone } from '../types';
import LoadingSpinner from '../components/ui/LoadingSpinner';

// AIContextType interface remains the same
interface AIContextType {
  modelLoaded: boolean;
  modelProgress: string;
  isLoadingInitialItems: boolean;
  isLoadingChatMessage: boolean; // Added for chat loading state
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
  generateChatResponse: (props: { // Added for chat
    userMessage: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    onChunk: (chunk: string) => void;
  }) => Promise<string>;
}


const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const webLLMValues = useWebLLM();
  const { modelLoaded } = webLLMValues;

  // ++ This is the logic that was missing ++
  const [showLoader, setShowLoader] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // When the model finishes loading...
    if (modelLoaded) {
      // 1. Trigger the exit animation
      setIsExiting(true);
      // 2. Set a timer to remove the component from the DOM after the animation completes
      const timer = setTimeout(() => {
        setShowLoader(false);
      }, 500); // Duration must match your animation duration in tailwind.config

      // Cleanup function to clear the timer if the component unmounts
      return () => clearTimeout(timer);
    }
  }, [modelLoaded]); // This effect runs only when `modelLoaded` changes

  return (
    <AIContext.Provider value={webLLMValues}>
      {/* Render the loader based on our state, not directly on modelLoaded */}
      {showLoader && (
        <div
          // Conditionally apply the correct animation class
          className={`
            fixed top-6 right-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 
            rounded-lg shadow-xl p-4 w-full max-w-sm z-[9999]
            ${isExiting ? 'animate-slide-out-to-right' : 'animate-slide-in-from-right'}
          `}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center">
            <LoadingSpinner size="sm" />
            <div className="ml-3 flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Initializing AI Engine...
              </p>
              {webLLMValues.modelProgress && (
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {webLLMValues.modelProgress}
                </p>
              )}
            </div>
          </div>
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