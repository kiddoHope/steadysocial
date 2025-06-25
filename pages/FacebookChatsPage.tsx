import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FacebookSettings,
  FacebookPage,
  FacebookConversation,
  FacebookMessage,
  FacebookParticipantData
} from '../types';
// Removed useAuth as currentUser is not directly used for page logic, only for display (can be added back if needed)
import { dbGetFacebookSettings } from '../services/settingsService'; // Use direct DB call
import useFacebookSDK from '../hooks/useFacebookSDK';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';

const FacebookChatsPage: React.FC = () => {
  const [fbSettings, setFbSettings] = useState<FacebookSettings | null>(null);
  const [isLoadingFbSettings, setIsLoadingFbSettings] = useState(true);
  const [fbPages, setFbPages] = useState<FacebookPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<FacebookPage | null>(null);
  const [conversations, setConversations] = useState<FacebookConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<FacebookConversation | null>(null);
  const [messages, setMessages] = useState<FacebookMessage[]>([]);
  const [newMessageText, setNewMessageText] = useState('');

  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadSettings = async () => {
        setIsLoadingFbSettings(true);
        try {
            const settings = await dbGetFacebookSettings();
            setFbSettings(settings);
             if (!settings.appId) { // Check for main App ID used for chats/pages
                setError("Facebook App ID is not configured. Please set it in Settings to manage chats.");
            }
        } catch (err) {
            console.error("Failed to load FB settings for Chats:", err);
            setError("Could not load Facebook settings for chats.");
        } finally {
            setIsLoadingFbSettings(false);
        }
    };
    loadSettings();
  }, []);

  const { isSdkInitialized, fbApi, error: sdkError, FB: fbInstance } = useFacebookSDK(
    fbSettings?.appId, // Use main App ID for page/chat functionalities
    fbSettings?.sdkUrl
  );

  useEffect(() => {
    if (isSdkInitialized && fbApi && fbInstance?.getUserID() && fbSettings?.appId) {
      setIsLoadingPages(true);
      setError(null);
      fbApi<{ data: FacebookPage[] }>('/me/accounts?fields=id,name,access_token')
        .then(response => {
          setFbPages(response.data || []);
          // Auto-select page if one was stored in fbSettings (e.g. default page)
          if (fbSettings.pageId && response.data) {
              const defaultPage = response.data.find(p => p.id === fbSettings.pageId);
              if (defaultPage) setSelectedPage(defaultPage);
          }
        })
        .catch(err => {
          console.error('Error fetching Facebook pages:', err);
          setError(`Failed to fetch Facebook pages: ${err.message}. Ensure you are logged in via Settings with the Main App ID.`);
        })
        .finally(() => setIsLoadingPages(false));
    } else if (isSdkInitialized && !fbInstance?.getUserID() && fbSettings?.appId){
        setError("Please connect to Facebook via the Settings page (using the Main App ID) to manage chats.");
    } else if (fbSettings && !fbSettings.appId && !isLoadingFbSettings) {
        // This is handled by initial load check, but as a safeguard:
        if (!error) setError("Facebook App ID for pages/chats is not configured in Settings.");
    }
  }, [isSdkInitialized, fbApi, fbInstance, fbSettings, error]); // Added fbSettings and error to dependencies


  const fetchConversations = useCallback(async (page: FacebookPage) => {
    if (!fbApi || !page.access_token) {
      setError('Facebook API not ready or Page Access Token missing.');
      return;
    }
    setIsLoadingConversations(true);
    setError(null);
    setConversations([]);
    setSelectedConversation(null);
    setMessages([]);
    try {
      const response = await fbApi<{ data: FacebookConversation[] }>(
        `/${page.id}/conversations?fields=participants,snippet,unread_count,updated_time&access_token=${page.access_token}`
      );
      setConversations(response.data || []);
    } catch (err: any) {
      console.error('Error fetching conversations:', err);
      setError(`Failed to fetch conversations: ${err.message}`);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [fbApi]);

  useEffect(() => {
    if (selectedPage) {
      fetchConversations(selectedPage);
    }
  }, [selectedPage, fetchConversations]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    if (!fbApi || !selectedPage?.access_token) {
      setError('Facebook API not ready or Page Access Token missing.');
      return;
    }
    setIsLoadingMessages(true);
    setError(null);
    try {
      const response = await fbApi<{ data: FacebookMessage[] }>(
        `/${conversationId}/messages?fields=id,created_time,message,from{id,name,email}&limit=25&access_token=${selectedPage.access_token}`
      );
      setMessages(response.data?.sort((a,b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime()) || []);
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      setError(`Failed to fetch messages: ${err.message}`);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [fbApi, selectedPage]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    } else {
      setMessages([]);
    }
  }, [selectedConversation, fetchMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !selectedConversation || !fbApi || !selectedPage?.id || !selectedPage?.access_token) {
      setError('Cannot send message: Missing information, page selection, or API not ready.');
      return;
    }

    const recipientParticipant = selectedConversation.participants.data.find(
      (p: FacebookParticipantData) => p.id !== selectedPage.id
    );

    if (!recipientParticipant) {
      setError('Cannot send message: Recipient could not be identified.');
      return;
    }

    setIsSendingMessage(true);
    setError(null);
    try {
      await fbApi(
        `/${selectedPage.id}/messages`,
        'post',
        {
          recipient: { id: recipientParticipant.id },
          messaging_type: "RESPONSE",
          message: { text: newMessageText },
          access_token: selectedPage.access_token,
        }
      );
      setNewMessageText('');
      const sentMessage: FacebookMessage = {
        id: `temp-${Date.now()}`,
        created_time: new Date().toISOString(),
        message: newMessageText,
        from: { id: selectedPage.id, name: selectedPage.name || "My Page" } 
      };
      setMessages(prev => [...prev, sentMessage]);
      setTimeout(() => fetchMessages(selectedConversation.id), 1500); 
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(`Failed to send message: ${err.message}`);
    } finally {
      setIsSendingMessage(false);
    }
  };
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getParticipantName = (participants: FacebookParticipantData[], pageId?: string): string => {
    const otherParticipant = participants.find(p => p.id !== pageId);
    return otherParticipant?.name || 'Unknown User';
  };

  if (isLoadingFbSettings) {
    return <div className="p-4 flex items-center justify-center h-64"><LoadingSpinner size="lg"/><p className="ml-3">Loading settings...</p></div>;
  }
  if (!fbSettings?.appId && !error) { // If no App ID and no other error message is already set
     return <Alert type="warning" message="Facebook App ID for pages/chats is not configured. Please set it in Settings." />;
  }
  if (sdkError && !error) { // If SDK error and no other error message
     return <Alert type="error" message={`Facebook SDK Error: ${sdkError}. Please check settings and ensure you are connected via Settings (Main App ID).`} />;
  }
   if (!isSdkInitialized && fbSettings?.appId && !error) { // If SDK not init, App ID exists, and no other error
    return <div className="p-4 flex items-center justify-center h-64"><LoadingSpinner size="lg"/><p className="ml-3">Initializing Facebook SDK...</p></div>;
  }


  return (
    <div className="flex flex-col h-[calc(100vh-var(--navbar-height,64px)-2rem)] animate-fadeIn">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Facebook Page Chats</h1>
      </header>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-4" />}

      <div className="mb-4">
        <Select
          label="Select Facebook Page"
          id="fbPageSelect"
          value={selectedPage?.id || ''}
          onChange={(e) => {
            const page = fbPages.find(p => p.id === e.target.value);
            setSelectedPage(page || null);
            setSelectedConversation(null); 
            setMessages([]);
          }}
          options={fbPages.map(p => ({ value: p.id, label: p.name }))}
          placeholder="-- Select a Page --"
          disabled={isLoadingPages || fbPages.length === 0 || !isSdkInitialized || !fbInstance?.getUserID()}
          wrapperClassName="max-w-sm"
        />
        {isLoadingPages && <LoadingSpinner size="sm" className="mt-2" />}
      </div>

      {selectedPage && (
        <div className="flex-grow flex border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-md">
          <div className="w-1/3 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-slate-50 dark:bg-slate-800">
            <div className="p-3 border-b border-slate-200 dark:border-slate-600">
              <h2 className="font-semibold text-slate-700 dark:text-slate-200">Conversations ({conversations.length})</h2>
            </div>
            {isLoadingConversations ? (
              <div className="flex-grow flex items-center justify-center"><LoadingSpinner /></div>
            ) : conversations.length === 0 ? (
                <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No conversations found for this page.</p>
            ) : (
              <ul className="overflow-y-auto flex-grow">
                {conversations.sort((a,b) => new Date(b.updated_time).getTime() - new Date(a.updated_time).getTime()).map(conv => (
                  <li key={conv.id}
                      className={`p-3 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-200 dark:border-slate-600 ${selectedConversation?.id === conv.id ? 'bg-primary-100 dark:bg-primary-700/50' : ''}`}
                      onClick={() => setSelectedConversation(conv)}
                      role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelectedConversation(conv)}
                      aria-pressed={selectedConversation?.id === conv.id}
                  >
                    <div className="flex justify-between items-center">
                        <p className={`font-medium text-sm truncate ${conv.unread_count > 0 ? 'text-primary-600 dark:text-primary-400' : 'text-slate-800 dark:text-slate-100'}`}>
                            {getParticipantName(conv.participants.data, selectedPage.id)}
                        </p>
                        {conv.unread_count > 0 && (
                            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{conv.unread_count}</span>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1" title={conv.snippet || conv.messages?.data[0]?.message}>
                        {conv.snippet || conv.messages?.data[0]?.message || 'No messages yet.'}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{new Date(conv.updated_time).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="w-2/3 flex flex-col bg-white dark:bg-slate-800/70">
            {selectedConversation ? (
              <>
                <div className="p-3 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700">
                  <h2 className="font-semibold text-slate-700 dark:text-slate-200">
                    Chat with {getParticipantName(selectedConversation.participants.data, selectedPage.id)}
                  </h2>
                </div>
                <div className="flex-grow overflow-y-auto p-4 space-y-3 bg-slate-100 dark:bg-slate-800">
                  {isLoadingMessages ? (
                    <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>
                  ) : messages.length === 0 ? (
                     <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">No messages in this conversation yet.</p>
                  ) : (
                    messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.from.id === selectedPage.id ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] p-2 px-3 rounded-lg shadow ${msg.from.id === selectedPage.id ? 'bg-primary-500 text-white dark:bg-primary-600' : 'bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100'}`}>
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                          <p className={`text-xs mt-1 ${msg.from.id === selectedPage.id ? 'text-primary-200 dark:text-primary-300' : 'text-slate-500 dark:text-slate-400'}`}>
                            {new Date(msg.created_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700">
                  <div className="flex items-center space-x-2">
                    <Input
                      type="text"
                      value={newMessageText}
                      onChange={(e) => setNewMessageText(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 !my-0"
                      wrapperClassName="flex-1 !mb-0"
                      disabled={isSendingMessage || isLoadingMessages}
                      aria-label="New message input"
                    />
                    <Button type="submit" variant="primary" isLoading={isSendingMessage} disabled={isSendingMessage || !newMessageText.trim()}>
                      Send
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex-grow flex items-center justify-center">
                 {isLoadingPages || isLoadingFbSettings ? 
                    <LoadingSpinner /> : 
                    <p className="text-slate-500 dark:text-slate-400">
                        {fbPages.length > 0 ? "Select a conversation to view messages." : "No pages available or user not connected."}
                    </p>
                }
              </div>
            )}
          </div>
        </div>
      )}
       {!selectedPage && !isLoadingPages && !isLoadingFbSettings && fbPages.length > 0 && !error && (
            <Card className="mt-4"><p className="text-center p-8 text-slate-500 dark:text-slate-400">Please select a Facebook Page to view its chats.</p></Card>
        )}
        {!selectedPage && !isLoadingPages && !isLoadingFbSettings && fbPages.length === 0 && isSdkInitialized && !error && (
             <Card className="mt-4"><p className="text-center p-8 text-slate-500 dark:text-slate-400">No Facebook Pages found. Ensure your account manages pages and you have granted `pages_show_list` permission via Settings (Main App ID).</p></Card>
        )}

    </div>
  );
};

export default FacebookChatsPage;
