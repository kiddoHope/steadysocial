import React from 'react';
import { useChatbot } from '../../contexts/ChatbotContext';

const ChatbotFAB: React.FC = () => {
  const { toggleChat, isChatOpen } = useChatbot();

  return (
    <button
      onClick={toggleChat}
      className={`fixed bottom-8 right-8 bg-neo-accent text-white neo-border neo-shadow-lg h-16 w-16 focus:outline-none transition-all duration-200 z-[9990] flex items-center justify-center hover:-translate-x-1 hover:-translate-y-1 hover:neo-shadow-xl active:translate-x-0 active:translate-y-0 active:shadow-none ${isChatOpen ? 'rotate-90' : 'hover:-rotate-3'}`}
      aria-label={isChatOpen ? "Close Chatbot" : "Open Chatbot"}
      aria-expanded={isChatOpen}
    >
      {isChatOpen ? (
        <i className="fas fa-times text-2xl"></i>
      ) : (
        <i className="fas fa-robot text-2xl"></i>
      )}
    </button>
  );
};

export default ChatbotFAB;
