
import React from 'react';
import { useChatbot } from '../../contexts/ChatbotContext';

const ChatbotFAB: React.FC = () => {
  const { toggleChat, isChatOpen } = useChatbot();

  return (
    <button
      onClick={toggleChat}
      className={`fixed bottom-6 right-6 bg-primary-500 hover:bg-primary-600 text-white rounded-full h-[3vw] w-[3vw] shadow-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-opacity-75 transition-transform duration-200 ease-in-out z-[9990] ${isChatOpen ? 'transform scale-90' : 'transform scale-100'}`}
      aria-label={isChatOpen ? "Close Chatbot" : "Open Chatbot"}
      aria-expanded={isChatOpen}
    >
      {isChatOpen ? (
        <i className="fas fa-times fa-lg"></i>
      ) : (
        <i className="fas fa-comments fa-lg"></i>
      )}
    </button>
  );
};

export default ChatbotFAB;
