import React, { useState, useMemo } from 'react';
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

  const [isThinkingVisible, setIsThinkingVisible] = useState(false);

  const parsedContent = useMemo(() => {
    if (message.role !== 'assistant') {
      return { thinking: null, main: message.content };
    }
    const thinkRegex = /^<think>([\s\S]*?)<\/think>([\s\S]*)/;
    const match = message.content.match(thinkRegex);

    if (match) {
      return { thinking: match[1].trim(), main: match[2].trim() };
    }
    return { thinking: null, main: message.content };
  }, [message.content, message.role]);

  const assistantIcon = (
    <div className="flex-shrink-0 h-8 w-8 neo-border bg-neo-accent text-white flex items-center justify-center mr-2 -rotate-6 self-end">
      <i className="fas fa-robot text-xs"></i>
    </div>
  );
  const userIcon = (
    <div className="flex-shrink-0 h-8 w-8 neo-border bg-neo-black text-white flex items-center justify-center ml-2 rotate-6 self-end">
      <i className="fas fa-user text-xs"></i>
    </div>
  );

  const TypingIndicator = () => (
    <div className="flex items-center space-x-1 p-2">
        <div className="h-2 w-2 bg-neo-black animate-bounce [animation-delay:-0.3s] neo-border-sm"></div>
        <div className="h-2 w-2 bg-neo-black animate-bounce [animation-delay:-0.15s] neo-border-sm"></div>
        <div className="h-2 w-2 bg-neo-black animate-bounce neo-border-sm"></div>
    </div>
  );

  return (
    <div className={`flex mb-4 ${isUser ? 'justify-end' : 'justify-start'} font-space`}>
      {isAssistant && assistantIcon}
      <div
        className={`p-4 neo-border-sm max-w-[85%] relative overflow-hidden ${isUser ? 'bg-neo-black text-white rotate-1' : 'bg-white text-neo-black -rotate-1'}`}
      >
        <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>
        
        {isAssistant && message.content === '' ? (
          <TypingIndicator />
        ) : (
          <div className="relative z-10">
            {isAssistant && parsedContent.thinking && (
              <div className="mb-4 border-b-2 border-neo-black pb-2">
                <button
                  onClick={() => setIsThinkingVisible(prev => !prev)}
                  className="text-[8px] font-black uppercase tracking-[0.2em] flex items-center w-full opacity-60 hover:opacity-100 transition-opacity"
                >
                  <i className={`fas fa-caret-right mr-2 transition-transform duration-200 ${isThinkingVisible ? 'rotate-90' : ''}`}></i>
                  THOUGHT_PROCESS_LOG
                </button>
                {isThinkingVisible && (
                  <div className="mt-2 p-3 bg-neo-bg/50 border-2 border-neo-black text-[9px] font-bold leading-tight uppercase">
                    {parsedContent.thinking}
                  </div>
                )}
              </div>
            )}

            <div className="prose prose-sm max-w-none break-words font-bold text-xs uppercase tracking-tight leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm as any]}>
                {parsedContent.main}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
      {isUser && userIcon}
    </div>
  );
};

export default ChatMessage;
