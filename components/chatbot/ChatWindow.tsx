
import React, { useState, useEffect, useRef } from 'react';
import { useChatbot, ChatMessage as ChatMessageType } from '../../contexts/ChatbotContext';
import ChatMessage from './ChatMessage';
import Input from '../ui/Input';
import Button from '../ui/Button';
import LoadingSpinner from '../ui/LoadingSpinner'; // For inline loading indicator

const ChatWindow: React.FC = () => {
  const { messages, sendMessage, isLoading, error, clearError, toggleChat } = useChatbot();
  const [userInput, setUserInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  console.log(messages);
  
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
      className="fixed bottom-20 right-6 w-full max-w-md h-[70vh] max-h-[500px] bg-white dark:bg-slate-800 shadow-2xl rounded-lg flex flex-col overflow-hidden border border-slate-300 dark:border-slate-700 z-[9998]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chatbot-title"
    >
      <header className="p-4 bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 flex justify-between items-center">
        <h2 id="chatbot-title" className="text-lg font-semibold text-primary-600 dark:text-primary-400">
          <i className="fas fa-robot mr-2"></i>SteadySocial AI
        </h2>
        <button
          onClick={toggleChat}
          className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          aria-label="Close chat"
        >
          <i className="fas fa-times fa-lg"></i>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-800/50">
        {messages.map((msg, index) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isLastMessage={index === messages.length - 1} // Pass the isLastMessage prop
          />
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 text-sm flex justify-between items-center">
          <span>Error: {error}</span>
          <button onClick={clearError} className="text-red-500 hover:text-red-700 dark:hover:text-red-300" aria-label="Clear error">
             <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-700">
        <div className="flex items-center space-x-2">
          <Input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Ask SteadySocial AI..."
            className="flex-1 !my-0 dark:bg-slate-800" // Override margin from Input component
            wrapperClassName="flex-1 !mb-0" // Override margin from Input component
            aria-label="Chat message input"
            disabled={isLoading}
          />
          <Button type="submit" variant="primary" className="w-5" isLoading={isLoading} disabled={isLoading || !userInput.trim()} aria-label="Send message">
            {isLoading ? <span className="sr-only">Sending...</span> : <i className="fas fa-paper-plane"></i>}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ChatWindow;
