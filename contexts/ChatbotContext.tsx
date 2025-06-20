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

  useEffect(() => {
    if (webLLMError) {
        setChatbotError(webLLMError);
    }
  }, [webLLMError]);

  const toggleChat = useCallback(() => {
    setIsChatOpen(prev => !prev);
    if (!isChatOpen) {
        clearError();
    }
  }, [isChatOpen]);

  const clearError = useCallback(() => {
    setChatbotError(null);
    setWebLLMError(null);
  }, [setWebLLMError]);

 // src/contexts/ChatbotContext.tsx

  const sendMessage = async (text: string) => {
    if (!modelLoaded) {
      setChatbotError("AI Model is not ready. Please wait for it to load.");
      return;
    }
    if (!text.trim()) return;

    clearError();

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const historyForAI = messages.map(msg => ({ role: msg.role, content: msg.content }));

    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '', // This correctly triggers the typing indicator initially
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage, assistantPlaceholder]);

    try {
      // 1. Capture the final, complete string that the promise resolves with.
      const finalContent = await generateChatResponse({
        userMessage: text,
        history: historyForAI,
        onChunk: (chunk: string) => {
          // 2. Update the message content during streaming by appending the new chunk
          //    to the previous state's content. This is a more robust way to handle streaming updates.
          setMessages(prev =>
            prev.map(msg =>
                msg.id === assistantMessageId ? { ...msg, content: msg.content + chunk } : msg
            )
          );
        }
      });
      

      // 3. After the stream is finished, perform one final state update to guarantee
      //    the message has the exact, complete content from the resolved promise.
      //    This corrects any potential discrepancies from the streaming.
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId ? { ...msg, content: finalContent } : msg
        )
      );

    } catch (e: any) {
      const errorMessage = e.message || "An error occurred while communicating with the local AI.";
      setChatbotError(errorMessage);
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