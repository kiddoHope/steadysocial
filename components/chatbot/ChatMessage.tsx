import React, { useState, useMemo } from 'react'; // Import useState and useMemo
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage as ChatMessageType } from '../../contexts/ChatbotContext';

interface ChatMessageProps {
  message: ChatMessageType;
  isLastMessage?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // ++ 1. ADD STATE for managing the collapsible "thinking" section ++
  const [isThinkingVisible, setIsThinkingVisible] = useState(false);

  // ++ 2. PARSE THE CONTENT to separate the <think> block from the main message ++
  const parsedContent = useMemo(() => {
    if (message.role !== 'assistant') {
      return { thinking: null, main: message.content };
    }

    // Regex to capture content inside <think> tags and the rest of the string
    const thinkRegex = /^<think>([\s\S]*?)<\/think>([\s\S]*)/;
    const match = message.content.match(thinkRegex);

    if (match) {
      // match[1] is the thinking part, match[2] is the main response
      return { thinking: match[1].trim(), main: match[2].trim() };
    }

    // If no <think> block is found, the whole message is the main content
    return { thinking: null, main: message.content };
  }, [message.content, message.role]);


  // Base classes and icons (unchanged)
  const bubbleBaseClasses = "p-3 rounded-xl max-w-[80%] shadow";
  const userAlignClasses = "ml-auto bg-primary-500 text-white dark:bg-primary-600";
  const assistantAlignClasses = "mr-auto bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100";
  const containerBaseClasses = "flex mb-2 min-h-[44px]";
  const userContainerClasses = "justify-end";
  const assistantContainerClasses = "justify-start";
  const assistantIcon = (
    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-secondary-500 text-white flex items-center justify-center mr-2 shadow self-end">
      <i className="fas fa-robot text-sm"></i>
    </div>
  );
  const userIcon = (
    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-300 dark:bg-slate-500 text-slate-700 dark:text-slate-100 flex items-center justify-center ml-2 shadow self-end">
      <i className="fas fa-user text-sm"></i>
    </div>
  );
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
        {isAssistant && message.content === '' ? (
          <TypingIndicator />
        ) : (
          <>
            {/* ++ 3. RENDER THE COLLAPSIBLE UI for the "thinking" process ++ */}
            {isAssistant && parsedContent.thinking && (
              <div className="border-b border-slate-300 dark:border-slate-500 mb-2 pb-2">
                <button
                  onClick={() => setIsThinkingVisible(prev => !prev)}
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center w-full"
                  aria-expanded={isThinkingVisible}
                >
                  <i className={`fas fa-chevron-right mr-2 transition-transform duration-200 ${isThinkingVisible ? 'rotate-90' : ''}`}></i>
                  AI Thought Process
                </button>
                {isThinkingVisible && (
                  <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-700/70 rounded-md text-xs text-slate-600 dark:text-slate-300">
                    <p className="whitespace-pre-wrap font-mono">
                      <i className="fas fa-lightbulb mr-2 text-yellow-400"></i>
                      {parsedContent.thinking}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Render the main response using the parsed content */}
            <ReactMarkdown 
              className="markdown-content max-w-none break-words"
              remarkPlugins={[remarkGfm]}
            >
              {parsedContent.main}
            </ReactMarkdown>
          </>
        )}
      </div>
      {isUser && userIcon}
    </div>
  );
};

export default ChatMessage;