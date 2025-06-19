import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAI } from './AIContext';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatbotContextType {
  isChatOpen: boolean;
  toggleChat: () => void;
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined);

export const ChatbotProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatbotError, setChatbotError] = useState<string | null>(null);

  const {
    generateChatResponse,
    isLoadingChatMessage: isWebLLMLoadingChat,
    error: webLLMError,
    setError: setWebLLMError,
    modelLoaded
  } = useAI();

  // Effect to set the initial greeting message
  useEffect(() => {
    setMessages([
      {
        id: `ai-greeting-${Date.now()}`,
        role: 'assistant',
        content: "Hello! I'm SteadySocial AI. How can I help you create amazing social media content today? (Powered by local WebLLM)",
        timestamp: Date.now(),
      }
    ]);
  }, []);

  // Effect to sync errors from the AI context
  useEffect(() => {
    if (webLLMError) {
        setChatbotError(webLLMError);
    }
  }, [webLLMError]);

  // Toggles the chat window visibility
  const toggleChat = useCallback(() => {
    setIsChatOpen(prev => !prev);
    if (!isChatOpen) {
        clearError();
    }
  }, [isChatOpen, clearError]);

  // Clears any displayed errors
  const clearError = useCallback(() => {
    setChatbotError(null);
    setWebLLMError(null);
  }, [setWebLLMError]);

  // Main function to handle sending messages
  const sendMessage = async (text: string) => {
    if (!modelLoaded) {
      setChatbotError("AI Model is not ready. Please wait for it to load.");
      return;
    }
    if (!text.trim()) return;

    clearError();

    // Create the user's message object
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    // Prepare history for the AI model
    const historyForAI = messages.map(msg => ({ role: msg.role, content: msg.content }));

    // Create a placeholder for the assistant's response
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '', // Start with empty content for the typing indicator
      timestamp: Date.now()
    };

    // Add user message and assistant placeholder to the UI
    setMessages(prev => [...prev, userMessage, assistantPlaceholder]);

    try {
      // ** FIX: Await the full response from the AI **
      // The generateChatResponse promise resolves with the complete final string.
      const fullResponse = await generateChatResponse({
        userMessage: text,
        history: historyForAI,
        // The onChunk callback updates the UI in real-time as the response streams in
        onChunk: (chunk: string) => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: (msg.content || "") + chunk }
                : msg
            )
          );
        },
      });

      // ** FIX: Perform a final, definitive state update with the complete response **
      // This ensures the UI has the full and correct content once streaming is done.
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId ? { ...msg, content: fullResponse } : msg
        )
      );

    } catch (e: any) {
      const errorMessage = e.message || "An error occurred while communicating with the local AI.";
      setChatbotError(errorMessage);
      // Update the placeholder with an error message if something goes wrong
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId ? { ...msg, content: `Error: ${errorMessage}` } : msg
        )
      );
    }
  };

  return (
    <ChatbotContext.Provider value={{
      isChatOpen,
      toggleChat,
      messages,
      sendMessage,
      isLoading: isWebLLMLoadingChat,
      error: chatbotError,
      clearError
    }}>
      {children}
    </ChatbotContext.Provider>
  );
};

export const useChatbot = (): ChatbotContextType => {
  const context = useContext(ChatbotContext);
  if (context === undefined) {
    throw new Error('useChatbot must be used within a ChatbotProvider');
  }
  return context;
};
