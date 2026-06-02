import React, { useState } from 'react';
import FacebookChatsPage from './FacebookChatsPage';
import EmailChatsComponent from '../components/messaging/EmailChatsComponent';
import TelegramChatsComponent from '../components/messaging/TelegramChatsComponent';

export type MessagingChannel = 'facebook' | 'email' | 'telegram';

const MessagingPage: React.FC = () => {
  const [activeChannel, setActiveChannel] = useState<MessagingChannel>('facebook');

  const channels: { id: MessagingChannel; label: string; icon: string }[] = [
    { id: 'facebook', label: 'FACEBOOK', icon: '📘' },
    { id: 'email', label: 'EMAIL', icon: '✉️' },
    { id: 'telegram', label: 'TELEGRAM', icon: '✈️' },
  ];

  return (
    <div className="w-full h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="bg-neo-bg border-b neo-border flex gap-0 px-8 pt-8">
        {channels.map(channel => (
          <button
            key={channel.id}
            onClick={() => setActiveChannel(channel.id)}
            className={`px-6 py-4 text-sm font-black uppercase tracking-widest transition-all neo-border-b-2 ${
              activeChannel === channel.id
                ? 'bg-neo-accent text-white neo-border-b-primary shadow-lg transform -translate-y-0.5'
                : 'bg-neo-muted text-neo-black/60 hover:text-neo-black hover:bg-neo-accent/10'
            }`}
          >
            <span className="mr-2">{channel.icon}</span>
            {channel.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeChannel === 'facebook' && <FacebookChatsPage />}
        {activeChannel === 'email' && <EmailChatsComponent />}
        {activeChannel === 'telegram' && <TelegramChatsComponent />}
      </div>
    </div>
  );
};

export default MessagingPage;
