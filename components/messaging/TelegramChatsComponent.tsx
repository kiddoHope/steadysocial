import React, { useState, useCallback, useRef, useEffect } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Alert from '../ui/Alert';

export interface TelegramBot {
  id: string;
  botToken: string;
  botName: string;
  botUsername: string;
  isConnected: boolean;
}

export interface TelegramMessage {
  id: string;
  from: {
    id: number;
    firstName: string;
    lastName?: string;
    username?: string;
  };
  text?: string;
  timestamp: number;
  isMe?: boolean;
}

export interface TelegramChat {
  id: string;
  chatId: number;
  participantName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages?: TelegramMessage[];
}

const TelegramChatsComponent: React.FC = () => {
  const [telegramBots, setTelegramBots] = useState<TelegramBot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedBot = telegramBots.find(bot => bot.id === selectedBotId);
  const selectedChat = chats.find(chat => chat.id === selectedChatId);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!selectedChat || !selectedBot) return;
      if (!newMessageText.trim()) {
        setError('MESSAGE_EMPTY');
        return;
      }

      setIsSending(true);
      setError(null);

      try {
        // TODO: Implement Telegram message sending logic
        // This will integrate with the Telegram Bot API
        const newMessage: TelegramMessage = {
          id: `telegram-${Date.now()}`,
          from: {
            id: selectedBot.id as any,
            firstName: selectedBot.botName,
            username: selectedBot.botUsername,
          },
          text: newMessageText,
          timestamp: Date.now(),
          isMe: true,
        };

        setMessages(prev => [...prev, newMessage]);
        setNewMessageText('');
      } catch (err) {
        setError((err as Error).message || 'SEND_FAILED');
      } finally {
        setIsSending(false);
      }
    },
    [selectedChat, selectedBot, newMessageText]
  );

  if (telegramBots.length === 0) {
    return (
      <div className="min-h-full bg-neo-bg p-8 font-space flex items-center justify-center">
        <Card className="max-w-md">
          <div className="text-center">
            <div className="text-6xl mb-4">✈️</div>
            <h2 className="text-2xl font-black uppercase mb-4">TELEGRAM_INTEGRATION</h2>
            <p className="text-sm text-neo-black/60 mb-6 leading-relaxed">
              Telegram integration is coming soon. Connect your Telegram bot to manage customer conversations directly from SteadySocial OS.
            </p>
            <Button variant="primary" disabled className="w-full">
              CONNECT_TELEGRAM_BOT
            </Button>
            <p className="text-xs text-neo-black/40 mt-4">
              Coming in next release
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 max-w-[1600px] w-full mx-auto">
        <div>
          <div className="inline-block bg-neo-accent text-white px-2 py-0.5 mb-2 neo-border-sm rotate-1">
            <span className="text-[10px] font-black uppercase tracking-widest">TELEGRAM_PROTOCOL</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-neo-black leading-none">
            TELEGRAM_<span className="text-neo-secondary outline-text">HUB</span>
          </h1>
        </div>

        <div className="w-full md:w-auto flex items-center gap-4">
          <Select
            id="telegramBotSelect"
            value={selectedBotId || ''}
            onChange={setSelectedBotId}
            options={telegramBots.map(bot => ({
              value: bot.id,
              label: bot.botName,
            }))}
            placeholder="SELECT_TELEGRAM_BOT"
            disabled={telegramBots.length === 0}
          />
        </div>
      </header>

      <main className="relative z-10 max-w-[1600px] w-full mx-auto flex-grow flex gap-8 h-[75vh]">
        {error && (
          <Alert
            type="error"
            message={error}
            onClose={() => setError(null)}
            className="absolute top-0 right-0 z-50 -rotate-1"
          />
        )}

        {/* COLUMN 1: Chats List */}
        <div className="w-80 flex flex-col gap-6">
          <Card
            title="CHATS"
            className="flex-grow !p-0 neo-shadow-md bg-neo-muted overflow-hidden flex flex-col"
          >
            <div className="overflow-y-auto flex-1">
              {chats.length === 0 ? (
                <div className="p-4 text-center text-xs text-neo-black/40">
                  NO_CHATS
                </div>
              ) : (
                chats.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedChatId(chat.id)}
                    className={`w-full text-left p-4 border-b neo-border transition-all ${
                      selectedChatId === chat.id
                        ? 'bg-neo-accent text-white'
                        : 'hover:bg-neo-accent/10'
                    }`}
                  >
                    <div className="font-bold text-sm truncate">{chat.participantName}</div>
                    <div className="text-xs opacity-70 truncate">{chat.lastMessage}</div>
                    <div className="text-xs opacity-50 mt-1">{chat.lastMessageTime}</div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* COLUMN 2: Message Thread */}
        <div className="flex-1 flex flex-col gap-6">
          {selectedChat ? (
            <>
              <Card
                title={`@${selectedChat.participantName}`}
                className="flex-grow !p-4 neo-shadow-md bg-neo-muted overflow-hidden flex flex-col"
              >
                <div className="overflow-y-auto flex-1 mb-4 space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center text-xs text-neo-black/40 py-8">
                      NO_MESSAGES
                    </div>
                  ) : (
                    messages.map(message => (
                      <div
                        key={message.id}
                        className={`flex ${message.isMe ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] p-4 neo-border-sm rounded-lg ${
                            message.isMe
                              ? 'bg-neo-accent text-white'
                              : 'bg-white text-neo-black'
                          }`}
                        >
                          <p className="text-xs font-bold mb-2 opacity-70">
                            {message.from.firstName}
                          </p>
                          <p className="text-sm leading-relaxed">{message.text}</p>
                          <p className="text-xs opacity-50 mt-2">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </Card>

              <form onSubmit={handleSendMessage} className="p-6 bg-neo-muted neo-border-t">
                <div className="flex gap-4">
                  <Input
                    type="text"
                    value={newMessageText}
                    onChange={e => setNewMessageText(e.target.value)}
                    placeholder="SEND_TELEGRAM_MESSAGE..."
                    disabled={isSending}
                    className="flex-1 !mb-0"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isSending}
                    disabled={isSending || !newMessageText.trim()}
                  >
                    SEND
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <Card className="flex-grow flex items-center justify-center neo-shadow-md">
              <p className="text-neo-black/40 font-bold">SELECT_A_CHAT</p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default TelegramChatsComponent;
