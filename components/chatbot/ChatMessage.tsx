import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Assuming this path is correct for your project structure
// This is a local context, so it should remain as-is.
import { ChatMessage as ChatMessageType } from '../../contexts/ChatbotContext';

interface ChatMessageProps {
  message: ChatMessageType;
  isLastMessage?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const [isThinkingVisible, setIsThinkingVisible] = useState(false);

  // Updated parsing logic to handle <think> and a new <examples> tag
  const parsedContent = useMemo(() => {
    // Return early for user messages, no parsing needed.
    if (message.role !== 'assistant') {
      return { thinking: null, examples: null, main: message.content };
    }

    let remainingContent = message.content;
    let thinking = null;
    let examples = null;

    // 1. Extract <think> block if it exists
    const thinkRegex = /<think>([\s\S]*?)<\/think>/;
    const thinkMatch = remainingContent.match(thinkRegex);
    if (thinkMatch) {
      thinking = thinkMatch[1].trim();
      // Remove the matched block from the content
      remainingContent = remainingContent.replace(thinkRegex, '').trim();
    }

    // 2. Extract <examples> block from the remaining content if it exists
    const examplesRegex = /<examples>([\s\S]*?)<\/examples>/;
    const examplesMatch = remainingContent.match(examplesRegex);
    if (examplesMatch) {
      examples = examplesMatch[1].trim();
      // Remove the matched block from the content
      remainingContent = remainingContent.replace(examplesRegex, '').trim();
    }
    
    // 3. The rest is the main content
    return { thinking, examples, main: remainingContent };
  }, [message.content, message.role]);


  // --- UI Components & Styles (Unchanged) ---
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
            {/* RENDER THE COLLAPSIBLE "THINKING" PROCESS */}
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

            {/* RENDER THE MAIN RESPONSE */}
            {parsedContent.main && (
                 <ReactMarkdown 
                    className="markdown-content max-w-none break-words"
                    remarkPlugins={[remarkGfm]}
                  >
                  {parsedContent.main}
                </ReactMarkdown>
            )}
           
            {/* RENDER THE <examples> BLOCK */}
            {isAssistant && parsedContent.examples && (
              <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-700/70 rounded-lg">
                <h4 className="text-sm font-semibold mb-2 text-slate-600 dark:text-slate-300 flex items-center">
                    <i className="fas fa-file-alt mr-2"></i>
                    Content Examples
                </h4>
                {/* This container uses `whitespace-pre-wrap` to respect newlines and `break-words` to prevent overflow,
                  which directly solves the overlapping text issue.
                */}
                <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words font-sans">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {parsedContent.examples}
                    </ReactMarkdown>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {isUser && userIcon}
    </div>
  );
};

export default ChatMessage;
