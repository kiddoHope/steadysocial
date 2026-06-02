import React, { useState, useEffect, useRef } from 'react';
import { useChatbot } from '../../contexts/ChatbotContext';
import ChatMessage from './ChatMessage';
import Input from '../ui/Input';
import Button from '../ui/Button';

const ChatWindow: React.FC = () => {
  const { messages, sendMessage, isLoading, error, clearError, toggleChat } = useChatbot();
  const [userInput, setUserInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(scrollToBottom, [messages]);
  
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (userInput.trim()) {
      sendMessage(userInput.trim());
      setUserInput('');
    }
  };

  return (
    <div 
      className="fixed bottom-24 right-8 w-full max-w-sm h-[60vh] max-h-[500px] bg-white neo-border neo-shadow-lg flex flex-col overflow-hidden z-[9998] font-space"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chatbot-title"
    >
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="p-4 bg-neo-black border-b-4 border-neo-black flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2">
          <div className="bg-neo-accent p-1 neo-border-sm rotate-12">
            <i className="fas fa-robot text-xs text-white"></i>
          </div>
          <h2 id="chatbot-title" className="text-sm font-black text-white uppercase tracking-widest">
            STEADY_AI_LINK
          </h2>
        </div>
        <button
          onClick={toggleChat}
          className="w-8 h-8 bg-white neo-border-sm flex items-center justify-center hover:bg-neo-secondary transition-colors"
          aria-label="Close chat"
        >
          <i className="fas fa-times"></i>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-neo-bg/30 relative z-10 scrollbar-hide">
        {messages.map((msg, index) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isLastMessage={index === messages.length - 1}
          />
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-neo-muted p-3 neo-border-sm animate-pulse">
              <span className="text-[10px] font-black uppercase tracking-widest">SYNCING_RESPONSE...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="p-3 bg-neo-accent text-white text-[10px] font-black uppercase tracking-widest flex justify-between items-center relative z-10">
          <span>{error}</span>
          <button onClick={clearError} className="hover:text-neo-black transition-colors" aria-label="Clear error">
             <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="p-4 bg-neo-muted neo-border-t relative z-10">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="TRANSMIT_QUERY..."
            className="flex-1 !mb-0 !py-2 !text-xs"
            wrapperClassName="flex-1 !mb-0"
            disabled={isLoading}
          />
          <Button type="submit" variant="primary" className="!p-3" isLoading={isLoading} disabled={isLoading || !userInput.trim()}>
            <i className="fas fa-paper-plane text-xs"></i>
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ChatWindow;
