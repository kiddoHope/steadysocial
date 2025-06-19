import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage as ChatMessageType } from '../../contexts/ChatbotContext'; // Ensure this path is correct

interface ChatMessageProps {
  message: ChatMessageType;
  isLastMessage?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Base classes for message bubbles
  const bubbleBaseClasses = "p-3 rounded-xl max-w-[80%] shadow";
  // Alignment classes
  const userAlignClasses = "ml-auto bg-primary-500 text-white dark:bg-primary-600";
  const assistantAlignClasses = "mr-auto bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100";
  // Container classes for alignment
  const containerBaseClasses = "flex mb-2 min-h-[44px]"; // Added min-height for bubble consistency
  const userContainerClasses = "justify-end";
  const assistantContainerClasses = "justify-start";

  // Icon for assistant
  const assistantIcon = (
    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-secondary-500 text-white flex items-center justify-center mr-2 shadow self-end">
      <i className="fas fa-robot text-sm"></i>
    </div>
  );
  
  // Icon for user
  const userIcon = (
    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-300 dark:bg-slate-500 text-slate-700 dark:text-slate-100 flex items-center justify-center ml-2 shadow self-end">
      <i className="fas fa-user text-sm"></i>
    </div>
  );

  // ++ FIX: Typing indicator component
  const TypingIndicator = () => (
    <div className="flex items-center justify-center space-x-1 p-2">
        <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
        <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
        <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce"></span>
    </div>
  );

  return (
    <div className={`${containerBaseClasses} ${isUser ? userContainerClasses : assistantContainerClasses}`}>
      {isAssistant && assistantIcon}
      <div
        className={`${bubbleBaseClasses} ${isUser ? userAlignClasses : assistantAlignClasses}`}
        aria-label={`${message.role} message`}
      >
        {/* ++ FIX: Conditionally render typing indicator or message content ++ */}
        {isAssistant && message.content === '' ? (
          <TypingIndicator />
        ) : (
          <ReactMarkdown 
            className="markdown-content max-w-none break-words"
            remarkPlugins={[remarkGfm]}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
      {isUser && userIcon}
    </div>
  );
};

export default ChatMessage;
