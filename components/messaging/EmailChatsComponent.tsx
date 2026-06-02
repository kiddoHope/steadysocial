import React, { useState, useCallback, useRef, useEffect } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Alert from '../ui/Alert';

export interface EmailAccount {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'custom';
  isConnected: boolean;
}

export interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  read: boolean;
  isMe?: boolean;
}

export interface EmailConversation {
  id: string;
  participantEmail: string;
  participantName: string;
  subject: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages?: EmailMessage[];
}

const EmailChatsComponent: React.FC = () => {
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<EmailConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [newMessageBody, setNewMessageBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedAccount = emailAccounts.find(acc => acc.id === selectedAccountId);
  const selectedConversation = conversations.find(conv => conv.id === selectedConversationId);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!selectedConversation || !selectedAccount) return;
      if (!newMessageBody.trim()) {
        setError('MESSAGE_EMPTY');
        return;
      }

      setIsSending(true);
      setError(null);

      try {
        // TODO: Implement email sending logic
        // This will integrate with the email service backend
        const newMessage: EmailMessage = {
          id: `email-${Date.now()}`,
          from: selectedAccount.email,
          to: selectedConversation.participantEmail,
          subject: `Re: ${selectedConversation.subject}`,
          body: newMessageBody,
          timestamp: new Date().toISOString(),
          read: true,
          isMe: true,
        };

        setMessages(prev => [...prev, newMessage]);
        setNewMessageBody('');
      } catch (err) {
        setError((err as Error).message || 'SEND_FAILED');
      } finally {
        setIsSending(false);
      }
    },
    [selectedConversation, selectedAccount, newMessageBody]
  );

  if (emailAccounts.length === 0) {
    return (
      <div className="min-h-full bg-neo-bg p-8 font-space flex items-center justify-center">
        <Card className="max-w-md">
          <div className="text-center">
            <div className="text-6xl mb-4">✉️</div>
            <h2 className="text-2xl font-black uppercase mb-4">EMAIL_INTEGRATION</h2>
            <p className="text-sm text-neo-black/60 mb-6 leading-relaxed">
              Email integration is coming soon. Connect your email account to manage customer communications directly from SteadySocial OS.
            </p>
            <Button variant="primary" disabled className="w-full">
              CONNECT_EMAIL_ACCOUNT
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
            <span className="text-[10px] font-black uppercase tracking-widest">EMAIL_PROTOCOL</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-neo-black leading-none">
            EMAIL_<span className="text-neo-secondary outline-text">HUB</span>
          </h1>
        </div>

        <div className="w-full md:w-auto flex items-center gap-4">
          <Select
            id="emailAccountSelect"
            value={selectedAccountId || ''}
            onChange={setSelectedAccountId}
            options={emailAccounts.map(acc => ({
              value: acc.id,
              label: acc.email,
            }))}
            placeholder="SELECT_EMAIL_ACCOUNT"
            disabled={emailAccounts.length === 0}
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

        {/* COLUMN 1: Conversations List */}
        <div className="w-80 flex flex-col gap-6">
          <Card
            title="CONVERSATIONS"
            className="flex-grow !p-0 neo-shadow-md bg-neo-muted overflow-hidden flex flex-col"
          >
            <div className="overflow-y-auto flex-1">
              {conversations.length === 0 ? (
                <div className="p-4 text-center text-xs text-neo-black/40">
                  NO_CONVERSATIONS
                </div>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversationId(conv.id)}
                    className={`w-full text-left p-4 border-b neo-border transition-all ${
                      selectedConversationId === conv.id
                        ? 'bg-neo-accent text-white'
                        : 'hover:bg-neo-accent/10'
                    }`}
                  >
                    <div className="font-bold text-sm truncate">{conv.participantName}</div>
                    <div className="text-xs opacity-70 truncate">{conv.subject}</div>
                    <div className="text-xs opacity-50 mt-1">{conv.lastMessageTime}</div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* COLUMN 2: Message Thread */}
        <div className="flex-1 flex flex-col gap-6">
          {selectedConversation ? (
            <>
              <Card
                title={`${selectedConversation.participantName} - ${selectedConversation.subject}`}
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
                          className={`max-w-[80%] p-4 neo-border-sm ${
                            message.isMe
                              ? 'bg-neo-black text-white'
                              : 'bg-white text-neo-black'
                          }`}
                        >
                          <p className="text-xs font-bold mb-2 opacity-70">{message.from}</p>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
                          <p className="text-xs opacity-50 mt-2">{message.timestamp}</p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </Card>

              <form onSubmit={handleSendMessage} className="p-6 bg-neo-muted neo-border-t">
                <div className="flex gap-4">
                  <textarea
                    value={newMessageBody}
                    onChange={e => setNewMessageBody(e.target.value)}
                    placeholder="TYPE_YOUR_EMAIL_RESPONSE..."
                    disabled={isSending}
                    className="flex-1 p-3 neo-border-sm bg-white text-neo-black focus:outline-none min-h-[100px] font-bold text-sm resize-none"
                  />
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isSending}
                    disabled={isSending || !newMessageBody.trim()}
                  >
                    SEND_EMAIL
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <Card className="flex-grow flex items-center justify-center neo-shadow-md">
              <p className="text-neo-black/40 font-bold">SELECT_A_CONVERSATION</p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default EmailChatsComponent;
