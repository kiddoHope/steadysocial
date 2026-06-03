import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FacebookSettings,
  FacebookPage,
  FacebookConversation,
  FacebookMessage,
  FacebookParticipantData,
} from '../types';
import {
  dbGetFacebookSettings,
  dbSaveFacebookSettings,
} from '../services/settingsService';
import {
  chatDbService,
  ConversationState,
  CustomerStatus,
  Sentiment,
  CustomerDetails,
} from '../services/chatDbService';
import {
  generateAutoReply,
  extractCustomerDetailsFromChat,
  detectSentimentFromChat,
  determineCustomerStatusFromChat,
  ChatMessage,
  ProductDetail,
  filterProductDetailsByKeywords,
  ExtractedCustomerProfile,
} from '../services/messengerAiService';
import { dbCreateLead, dbGetLeads, dbUpdateLead } from '../services/crmService';
import useFacebookSDK from '../hooks/useFacebookSDK';
import {
  ConfiguredFacebookPage,
  MultiPageFacebookSettings,
  getDefaultFacebookPage,
  getFacebookPageAccessToken,
  getPageAiAgentContext,
  getScopedConversationSettingsKey,
  normalizeFacebookPages,
} from '../utils/facebookPageUtils';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import { useAI } from '../contexts/AIContext';
import * as XLSX from 'xlsx';

const POLLING_INTERVAL_MS = 8000;
const MESSAGE_LIMIT = 25;

const getParticipantName = (
  participants: FacebookParticipantData[] = [],
  pageId?: string
): string => {
  const otherParticipant = participants.find(
    participant => String(participant.id) !== String(pageId)
  );

  return otherParticipant?.name?.toUpperCase() || 'UNKNOWN_ENTITY';
};

const sortConversationsByUpdatedTime = (
  items: FacebookConversation[]
): FacebookConversation[] => {
  return [...items].sort(
    (a, b) =>
      new Date(b.updated_time || 0).getTime() -
      new Date(a.updated_time || 0).getTime()
  );
};

const sortMessagesByCreatedTime = (
  items: FacebookMessage[]
): FacebookMessage[] => {
  return [...items].sort(
    (a, b) =>
      new Date(a.created_time || 0).getTime() -
      new Date(b.created_time || 0).getTime()
  );
};

const hasConversationChanged = (
  current: FacebookConversation,
  incoming: FacebookConversation
): boolean => {
  return (
    current.snippet !== incoming.snippet ||
    current.unread_count !== incoming.unread_count ||
    current.updated_time !== incoming.updated_time ||
    JSON.stringify(current.participants) !== JSON.stringify(incoming.participants)
  );
};

const mergeConversationPatch = (
  current: FacebookConversation,
  incoming: FacebookConversation
): FacebookConversation => ({
  ...current,
  snippet: incoming.snippet,
  unread_count: incoming.unread_count,
  updated_time: incoming.updated_time,
  participants: incoming.participants,
});

type ConversationRowProps = {
  conversation: FacebookConversation;
  selected: boolean;
  selectedPageId?: string;
  onSelect: (conversationId: string) => void;
  state?: ConversationState;
  isAiEnabled: boolean;
};

const ConversationRow = memo(
  ({ conversation, selected, selectedPageId, onSelect, state, isAiEnabled }: ConversationRowProps) => {
    const participantName = getParticipantName(
      conversation.participants?.data || [],
      selectedPageId
    );

    return (
      <button
        type="button"
        key={conversation.id}
        className={`w-full text-left p-4 neo-border-sm transition-colors relative overflow-hidden group ${
          selected
            ? 'bg-neo-black text-white translate-x-1 translate-y-1 shadow-none border-2 border-neo-black'
            : 'bg-white text-neo-black hover:bg-neo-secondary border-2 border-neo-black'
        }`}
        onClick={() => onSelect(conversation.id)}
      >
        <div className="flex justify-between items-start mb-1.5">
          <p className="font-black text-[11px] uppercase tracking-wider truncate max-w-[170px]">
            {participantName}
          </p>
        </div>

        <p className="text-[10px] font-bold opacity-75 truncate mb-2">
          {conversation.snippet || 'NO_DATA'}
        </p>

        {/* Dynamic Badges Container */}
        <div className="flex flex-wrap gap-1 mt-1">
          {/* NEW Badge */}
          {(conversation.unread_count > 0 || state?.customerStatus === 'New') && (
            <span className={`text-[8px] font-black px-1.5 py-0.5 border ${
              selected 
                ? 'bg-neo-accent text-white border-white' 
                : 'bg-neo-accent text-white border-neo-black'
            }`}>
              NEW
            </span>
          )}

          {/* HANDOFF Badge */}
          {!isAiEnabled && (
            <span className={`text-[8px] font-black px-1.5 py-0.5 border ${
              selected 
                ? 'bg-blue-500 text-white border-white' 
                : 'bg-blue-100 text-blue-800 border-neo-black'
            }`}>
              HANDOFF
            </span>
          )}

          {/* CONTINUOUS Badge */}
          {(isAiEnabled && (state?.autopilotMode === 'continuous' || !state?.autopilotMode)) && (
            <span className={`text-[8px] font-black px-1.5 py-0.5 border ${
              selected 
                ? 'bg-green-500 text-neo-black border-white' 
                : 'bg-green-100 text-green-800 border-neo-black'
            }`}>
              CONTINUOUS
            </span>
          )}

          {/* FOLLOW UP Badge */}
          {state?.autopilotMode === 'follow_up' && (
            <span className={`text-[8px] font-black px-1.5 py-0.5 border ${
              selected 
                ? 'bg-yellow-500 text-neo-black border-white' 
                : 'bg-yellow-100 text-yellow-800 border-neo-black'
            }`}>
              FOLLOW_UP
            </span>
          )}

          {/* CUSTOMER STATUS (Funnel Stages) Badge */}
          {state?.customerStatus && state.customerStatus !== 'New' && (
            <span className={`text-[8px] font-black px-1.5 py-0.5 border ${
              selected
                ? 'bg-white/20 text-white border-white'
                : state.customerStatus === 'Paid'
                ? 'bg-emerald-100 text-emerald-800 border-neo-black'
                : state.customerStatus === 'Completed'
                ? 'bg-indigo-100 text-indigo-800 border-neo-black'
                : state.customerStatus === 'Ordering'
                ? 'bg-amber-100 text-amber-800 border-neo-black'
                : 'bg-cyan-100 text-cyan-800 border-neo-black'
            }`}>
              {state.customerStatus.toUpperCase()}
            </span>
          )}

          {/* Custom tags list */}
          {state?.tags && state.tags.slice(0, 2).map((tag, idx) => (
            <span key={idx} className={`text-[8px] font-black px-1 py-0.5 border border-dashed truncate max-w-[80px] ${
              selected ? 'text-white border-white/40' : 'text-neo-black/60 border-neo-black/20'
            }`}>
              #{tag.toUpperCase()}
            </span>
          ))}
        </div>
      </button>
    );
  }
);

ConversationRow.displayName = 'ConversationRow';

const FacebookChatsPage: React.FC = () => {
  const [fbSettings, setFbSettings] = useState<MultiPageFacebookSettings | null>(null);
  const [isLoadingFbSettings, setIsLoadingFbSettings] = useState(true);
  const [fbPages, setFbPages] = useState<ConfiguredFacebookPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<ConfiguredFacebookPage | null>(null);
  const [conversations, setConversations] = useState<FacebookConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FacebookMessage[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const lastAiHandledMessageIdRef = useRef<string | null>(null);

  // CRM & Database tab state variables
  const [conversationState, setConversationState] = useState<ConversationState | null>(null);
  const [isCrmTab, setIsCrmTab] = useState<'crm' | 'database' | 'autopilot'>('crm');
  const [remarksText, setRemarksText] = useState('');
  const [detailsState, setDetailsState] = useState<CustomerDetails>({});
  const [tagsText, setTagsText] = useState('');
  const [isCrmLoading, setIsCrmLoading] = useState(false);
  const lastProcessedCrmMsgIdRef = useRef<string | null>(null);
  // Tracks which conversation IDs have already been auto-registered as leads this session
  const registeredLeadConvsRef = useRef<Set<string>>(new Set());
  const [conversationStatesMap, setConversationStatesMap] = useState<Record<string, ConversationState>>({});

  const refreshStatesMap = useCallback(async () => {
    try {
      const states = await chatDbService.getAllConversationStates(selectedPage?.id);
      setConversationStatesMap(states);
    } catch (err) {
      console.error('Failed to load conversation states map:', err);
    }
  }, [selectedPage?.id]);

  const syncLeadToCore = useCallback(async (conversationId: string, details: CustomerDetails) => {
    if (!details.fullName) return;
    try {
      const leads = await dbGetLeads();
      const existingLead = leads.find((l: any) =>
        l.messengerConversationId === conversationId &&
        (!selectedPage?.id || !l.facebookPageId || l.facebookPageId === selectedPage.id)
      );

      const leadData = {
        name: details.fullName,
        phone: details.contactNumber || undefined,
        email: details.email || undefined,
        notes: [
          selectedPage?.name ? `Facebook Page: ${selectedPage.name}` : undefined,
          details.address ? `Address: ${details.address}` : undefined,
        ].filter(Boolean).join('\n') || undefined,
        source: 'MESSENGER' as const,
        status: (existingLead?.status || 'NEW') as any,
        messengerConversationId: conversationId,
        facebookPageId: selectedPage?.id,
        facebookPageName: selectedPage?.name,
      } as any;

      if (existingLead) {
        await dbUpdateLead(existingLead.id, leadData);
        console.log('[LeadCore] Updated existing lead from Messenger:', details.fullName);
      } else {
        await dbCreateLead(leadData);
        console.log('[LeadCore] Registered new lead from Messenger:', details.fullName);
        registeredLeadConvsRef.current.add(conversationId);
      }
    } catch (err) {
      console.warn('[LeadCore] Failed to sync lead to Core:', err);
    }
  }, [selectedPage?.id, selectedPage?.name]);

  const [hasProductDb, setHasProductDb] = useState(false);
  const [hasBusinessDb, setHasBusinessDb] = useState(false);

  const [followUpDraftText, setFollowUpDraftText] = useState('');
  const [isDraftingFollowUp, setIsDraftingFollowUp] = useState(false);
  const [selectedFollowUpTone, setSelectedFollowUpTone] = useState('warm');
  const [matchedProductsPreview, setMatchedProductsPreview] = useState<ProductDetail[]>([]);

  const stages: CustomerStatus[] = ['New', 'Inquiry', 'Ordering', 'Paid', 'Shipped', 'Completed'];

  const { generateChatResponse, callAI } = useAI();

  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;

    return (
      conversations.find(
        conversation => conversation.id === selectedConversationId
      ) || null
    );
  }, [conversations, selectedConversationId]);

  const selectedPageId = selectedPage?.id;
  const selectedPageAccessToken = getFacebookPageAccessToken(selectedPage);
  const selectedPageContext = getPageAiAgentContext(fbSettings, selectedPage?.id);

  const isConversationAiEnabled = useCallback(
    (conversationId: string) => {
      const enabled = fbSettings?.aiEnabledConversations || [];
      const scopedKey = getScopedConversationSettingsKey(selectedPage?.id, conversationId);
      return enabled.includes(scopedKey) || enabled.includes(conversationId);
    },
    [fbSettings?.aiEnabledConversations, selectedPage?.id]
  );

  const refreshPageDatabases = useCallback(async (pageId?: string | null) => {
    const prod = await chatDbService.getProductData(pageId);
    const biz = await chatDbService.getBusinessData(pageId);
    setHasProductDb(!!prod);
    setHasBusinessDb(!!biz);
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      setIsLoadingFbSettings(true);

      try {
        const settings = (await dbGetFacebookSettings()) as MultiPageFacebookSettings;
        const pages = normalizeFacebookPages(settings);
        const defaultPage = getDefaultFacebookPage(pages, settings);

        setFbSettings(settings);
        setFbPages(pages);
        setSelectedPage(defaultPage);
        setIsLoggedIn(pages.length > 0);

        if (!settings.appId) {
          setError('FACEBOOK_APP_ID_MISSING');
        }

        if (pages.length === 0) {
          setError('NO_FACEBOOK_PAGES_CONFIGURED');
        }

        // Check local DB existence for the selected/default page.
        await refreshPageDatabases(defaultPage?.id);
        const states = await chatDbService.getAllConversationStates(defaultPage?.id);
        setConversationStatesMap(states);
      } catch (err) {
        console.error('Failed to load FB settings for Chats:', err);
        setError('SETTINGS_LOAD_FAILURE');
      } finally {
        setIsLoadingFbSettings(false);
      }
    };

    loadSettings();
  }, []);

  const { fbApi, error: sdkError } = useFacebookSDK(
    fbSettings?.appId,
    undefined,
    selectedPageAccessToken || fbSettings?.accessToken
  );

  useEffect(() => {
    if (sdkError) {
      setError(`FACEBOOK_API_ERROR: ${sdkError}`);
    }
  }, [sdkError]);

  useEffect(() => {
    if (!selectedPage?.id) return;
    refreshPageDatabases(selectedPage.id);
    refreshStatesMap();
  }, [selectedPage?.id, refreshPageDatabases, refreshStatesMap]);

  const fetchConversations = useCallback(
    async (page: FacebookPage) => {
      if (!fbApi || !page.access_token) {
        setError('AUTH_TOKEN_MISSING');
        return;
      }

      setIsLoadingConversations(true);
      setError(null);

      try {
        const response = await fbApi<{ data: FacebookConversation[] }>(
          `/${page.id}/conversations`,
          'get',
          {
            fields: 'participants,snippet,unread_count,updated_time',
            access_token: page.access_token,
          }
        );

        const incomingConversations = sortConversationsByUpdatedTime(
          response.data || []
        );

        setConversations(incomingConversations);

        setSelectedConversationId(previousSelectedId => {
          if (!previousSelectedId) return previousSelectedId;

          const stillExists = incomingConversations.some(
            conversation => conversation.id === previousSelectedId
          );

          return stillExists ? previousSelectedId : null;
        });
        await refreshStatesMap();
      } catch (err: any) {
        console.error('Error fetching conversations:', err);
        setError(`CONVERSATION_LOAD_ERROR: ${err.message}`);
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [fbApi]
  );

  const silentRefreshConversations = useCallback(
    async (page: FacebookPage) => {
      if (!fbApi || !page.access_token) return;

      try {
        const response = await fbApi<{ data: FacebookConversation[] }>(
          `/${page.id}/conversations`,
          'get',
          {
            fields: 'participants,snippet,unread_count,updated_time',
            access_token: page.access_token,
          }
        );

        const incomingConversations = response.data || [];

        setConversations(previousConversations => {
          const incomingMap = new Map(
            incomingConversations.map(conversation => [conversation.id, conversation])
          );

          const existingIds = new Set(
            previousConversations.map(conversation => conversation.id)
          );

          let hasChanges = false;

          const patchedExisting = previousConversations.map(existingConversation => {
            const incomingConversation = incomingMap.get(existingConversation.id);

            if (!incomingConversation) {
              return existingConversation;
            }

            if (!hasConversationChanged(existingConversation, incomingConversation)) {
              return existingConversation;
            }

            hasChanges = true;
            return mergeConversationPatch(existingConversation, incomingConversation);
          });

          const newConversations = incomingConversations.filter(
            conversation => !existingIds.has(conversation.id)
          );

          if (newConversations.length > 0) {
            hasChanges = true;
          }

          if (!hasChanges) {
            return previousConversations;
          }

          refreshStatesMap();
          return [...newConversations, ...patchedExisting];
        });
      } catch (err) {
        console.error('Silent conversation refresh failed:', err);
      }
    },
    [fbApi]
  );

  useEffect(() => {
    if (selectedPage) {
      fetchConversations(selectedPage);
    }
  }, [selectedPage, fetchConversations]);

  const fetchMessages = useCallback(
    async (
      conversationId: string,
      options?: { silent?: boolean; replace?: boolean }
    ) => {
      if (!fbApi || !selectedPageAccessToken) {
        if (!options?.silent) {
          setError('AUTH_TOKEN_MISSING');
        }
        return;
      }

      if (!options?.silent) {
        setIsLoadingMessages(true);
        setError(null);
      }

      try {
        const response = await fbApi<{ data: FacebookMessage[] }>(
          `/${conversationId}/messages`,
          'get',
          {
            fields: 'id,created_time,message,from{id,name,email}',
            limit: MESSAGE_LIMIT,
            access_token: selectedPageAccessToken,
          }
        );

        const incomingMessages = sortMessagesByCreatedTime(response.data || []);

        if (options?.replace) {
          setMessages(incomingMessages);
          return;
        }

        setMessages(previousMessages => {
          const existingIds = new Set(
            previousMessages.map(message => message.id)
          );

          const newMessages = incomingMessages.filter(
            message => !existingIds.has(message.id)
          );

          if (newMessages.length === 0) {
            return previousMessages;
          }

          return sortMessagesByCreatedTime([
            ...previousMessages,
            ...newMessages,
          ]);
        });
      } catch (err: any) {
        console.error('Error fetching messages:', err);

        if (!options?.silent) {
          setError(`MESSAGE_LOAD_ERROR: ${err.message}`);
        }
      } finally {
        if (!options?.silent) {
          setIsLoadingMessages(false);
        }
      }
    },
    [fbApi, selectedPageAccessToken]
  );

  useEffect(() => {
    if (!selectedPage || !fbApi) return;

    const intervalId = window.setInterval(() => {
      silentRefreshConversations(selectedPage);

      if (selectedConversationId) {
        fetchMessages(selectedConversationId, { silent: true });
      }
    }, POLLING_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [
    selectedPage,
    selectedConversationId,
    fbApi,
    silentRefreshConversations,
    fetchMessages,
  ]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      previousMessageCountRef.current = 0;
      lastAiHandledMessageIdRef.current = null;
      setConversationState(null);
      return;
    }

    setMessages([]);
    previousMessageCountRef.current = 0;
    lastAiHandledMessageIdRef.current = null;

    fetchMessages(selectedConversationId, { replace: true });
  }, [selectedConversationId, fetchMessages]);

  useEffect(() => {
    if (messages.length > previousMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    previousMessageCountRef.current = messages.length;
  }, [messages.length]);

  const isWithin24HourWindow = useCallback((conversation: FacebookConversation | null) => {
    if (!conversation?.updated_time) return false;

    const lastUpdate = new Date(conversation.updated_time).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    return now - lastUpdate <= twentyFourHours;
  }, []);

  const handleSelectConversation = useCallback(async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setFollowUpDraftText('');
    try {
      const state = await chatDbService.getConversationState(conversationId, selectedPage?.id);
      setConversationState(state);
      setRemarksText(state.remarks || '');
      setDetailsState(state.customerDetails || {});
      setTagsText((state.tags || []).join(', '));
      setSelectedFollowUpTone(state.followUpTone || 'warm');
    } catch (err) {
      console.error('Failed to load conversation state:', err);
    }
  }, []);

  const handleSendMessage = useCallback(
    async (e?: React.FormEvent, overrideMessage?: string) => {
      e?.preventDefault();

      const cleanMessage = (overrideMessage || newMessageText).trim();

      if (!selectedConversation) {
        setError('NO_CONVERSATION_SELECTED');
        return;
      }

      if (!isWithin24HourWindow(selectedConversation)) {
        setError(
          'TX_ERROR: This conversation is outside the 24-hour Messenger reply window. Ask the customer to message the Page again before replying.'
        );
        return;
      }

      if (!cleanMessage) {
        setError('MESSAGE_EMPTY');
        return;
      }

      if (!fbApi) {
        setError('FACEBOOK_API_NOT_READY');
        return;
      }

      if (!selectedPage?.id || !selectedPage.access_token) {
        setError('PAGE_AUTH_MISSING');
        return;
      }

      const participants = selectedConversation.participants?.data || [];

      const recipientParticipant = participants.find(
        participant => String(participant.id) !== String(selectedPage.id)
      );

      if (!recipientParticipant?.id) {
        console.error('Conversation participants:', participants);
        setError('RECIPIENT_UNKNOWN_OR_EMPTY');
        return;
      }

      setIsSendingMessage(true);
      setError(null);

      try {
        await fbApi(`/${selectedPage.id}/messages`, 'post', {
          messaging_type: 'RESPONSE',
          recipient: JSON.stringify({
            id: recipientParticipant.id,
          }),
          message: JSON.stringify({
            text: cleanMessage,
          }),
          access_token: selectedPage.access_token,
        });

        setNewMessageText('');

        const tempMessageId = `temp-${Date.now()}`;

        const sentMessage: FacebookMessage = {
          id: tempMessageId,
          created_time: new Date().toISOString(),
          message: cleanMessage,
          from: {
            id: selectedPage.id,
            name: selectedPage.name || 'MY_PAGE',
          },
        };

        setMessages(previousMessages => [...previousMessages, sentMessage]);

        window.setTimeout(() => {
          fetchMessages(selectedConversation.id, { silent: true });
        }, 1500);
      } catch (err: any) {
        console.error('Error sending message:', err);
        setError(`TX_ERROR: ${err.message}`);
      } finally {
        setIsSendingMessage(false);
      }
    },
    [
      fbApi,
      fetchMessages,
      isWithin24HourWindow,
      newMessageText,
      selectedConversation,
      selectedPage,
    ]
  );

  const toggleAiForConversation = useCallback(
    async (conversationId: string) => {
      if (!fbSettings) return;

      const currentEnabled = fbSettings.aiEnabledConversations || [];
      const scopedConversationId = getScopedConversationSettingsKey(selectedPage?.id, conversationId);
      const isEnabled = currentEnabled.includes(scopedConversationId) || currentEnabled.includes(conversationId);

      const newEnabled = isEnabled
        ? currentEnabled.filter(id => id !== scopedConversationId && id !== conversationId)
        : [...currentEnabled, scopedConversationId];

      const updatedSettings = {
        ...fbSettings,
        aiEnabledConversations: newEnabled,
      };

      setFbSettings(updatedSettings);
      await dbSaveFacebookSettings({ aiEnabledConversations: newEnabled });
      await chatDbService.toggleAi(conversationId, isEnabled ? 'disabled' : 'enabled', selectedPage?.id);
      refreshStatesMap();
    },
    [fbSettings, refreshStatesMap, selectedPage?.id]
  );



  const handleDraftFollowUp = useCallback(async () => {
    if (!selectedConversation || !fbSettings || isDraftingFollowUp) return;

    setIsDraftingFollowUp(true);
    setFollowUpDraftText('');
    try {
      let businessInfo = await chatDbService.getBusinessData(selectedPage?.id);
      if (!businessInfo) {
        businessInfo = {
          businessInfo: {
            name: selectedPage?.name || 'our business',
          },
          faq: selectedPageContext,
        };
      }

      const allProducts = await chatDbService.getProductData(selectedPage?.id) || { product_categories: [] };
      const currentConvState = await chatDbService.getConversationState(selectedConversation.id, selectedPage?.id);

      const chatMessages: ChatMessage[] = messages.map(msg => ({
        id: msg.id,
        created_time: msg.created_time,
        message: msg.message,
        from: {
          id: msg.from.id,
          name: msg.from.name,
        },
      }));

      // Generate a proactive follow-up
      const { reply } = await generateAutoReply(
        chatMessages,
        selectedPage?.id || '',
        true, // isFollowUp = true
        currentConvState.remarks || '',
        callAI,
        businessInfo,
        allProducts,
        selectedFollowUpTone
      );

      // Remove KIRA signature from the draft so it's clean for editing
      const cleanedDraft = reply.replace(/^Hi, I'm KIRA.*?\n\n/g, '').trim();
      setFollowUpDraftText(cleanedDraft);
    } catch (err) {
      console.error('Failed to draft follow-up:', err);
      alert('Error generating follow-up draft.');
    } finally {
      setIsDraftingFollowUp(false);
    }
  }, [
    selectedConversation,
    fbSettings,
    messages,
    selectedPage?.id,
    selectedPage?.name,
    selectedFollowUpTone,
    isDraftingFollowUp,
    callAI,
  ]);

  // Synchronize matched products in real-time for current selection
  useEffect(() => {
    const getMatches = async () => {
      if (!messages.length || !selectedConversationId) {
        setMatchedProductsPreview([]);
        return;
      }
      const lastMsg = messages[messages.length - 1];
      const queryText = lastMsg.message || '';
      if (!queryText) {
        setMatchedProductsPreview([]);
        return;
      }
      const allProducts = await chatDbService.getProductData(selectedPage?.id);
      if (!allProducts) {
        setMatchedProductsPreview([]);
        return;
      }
      // Simple keyword extraction for preview
      const words = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const matches = filterProductDetailsByKeywords(words, allProducts);
      setMatchedProductsPreview(matches);
    };
    getMatches();
  }, [messages, selectedConversationId]);

  useEffect(() => {
    const handleCrmUpdated = (e: any) => {
      if (selectedConversationId && e.detail.conversationId === selectedConversationId) {
        refreshStatesMap();
        chatDbService.getConversationState(selectedConversationId, selectedPage?.id).then(state => {
          setConversationState(state);
          setRemarksText(state.remarks || '');
          setDetailsState(state.customerDetails || {});
          setTagsText((state.tags || []).join(', '));
        });
      } else {
        refreshStatesMap();
      }
    };

    const handleGenerating = (e: any) => {
      if (selectedConversationId && e.detail.conversationId === selectedConversationId) {
        setIsAiGenerating(e.detail.isGenerating);
      }
    };

    const handleMessageSent = (e: any) => {
      if (selectedConversationId && e.detail.conversationId === selectedConversationId) {
        fetchMessages(selectedConversationId, { silent: true });
      }
    };

    window.addEventListener('messenger:crm_updated', handleCrmUpdated);
    window.addEventListener('messenger:generating', handleGenerating);
    window.addEventListener('messenger:message_sent', handleMessageSent);

    return () => {
      window.removeEventListener('messenger:crm_updated', handleCrmUpdated);
      window.removeEventListener('messenger:generating', handleGenerating);
      window.removeEventListener('messenger:message_sent', handleMessageSent);
    };
  }, [selectedConversationId, refreshStatesMap, fetchMessages]);

  const handlePageChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const page = fbPages.find(item => item.id === event.target.value);

      setSelectedPage(page || null);
      setSelectedConversationId(null);
      setMessages([]);
      setConversations([]);
      previousMessageCountRef.current = 0;
      lastAiHandledMessageIdRef.current = null;
    },
    [fbPages]
  );

  const handleSetCustomerStatus = async (status: CustomerStatus) => {
    if (!selectedConversation) return;
    await chatDbService.saveCustomerStatus(selectedConversation.id, status, selectedPage?.id);
    setConversationState(prev => prev ? { ...prev, customerStatus: status } : null);
    refreshStatesMap();
  };

  // Database Import Handlers
  const handleBusinessImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await chatDbService.saveBusinessData(json, selectedPage?.id);
      setHasBusinessDb(true);
      alert('Business FAQ database loaded successfully!');
    } catch (err: any) {
      console.error(err);
      alert('Failed to parse Business JSON file: ' + err.message);
    }
  };

  const handleProductImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet);

      const getValue = (obj: any, targetKeys: string[] | string): any => {
        const keys = Array.isArray(targetKeys) ? targetKeys : [targetKeys];
        for (const targetKey of keys) {
          const foundKey = Object.keys(obj).find(key => key.trim().toLowerCase() === targetKey.toLowerCase());
          if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null) {
            return obj[foundKey];
          }
        }
        return undefined;
      };

      const categories = jsonRows.reduce((acc, row) => {
        const categoryName = getValue(row, ['Category']);
        if (!categoryName) return acc;

        let categoryObj = acc.find((c: any) => c.category_name === categoryName);
        if (!categoryObj) {
          categoryObj = { category_name: categoryName, products: [] };
          acc.push(categoryObj);
        }

        const productName = getValue(row, ['Product Name', 'Product']);
        if (!productName) return acc;

        const product: any = { product_name: productName };
        const size = getValue(row, ['Size']);
        if (size) product.size = size;
        const sku = getValue(row, ['SKU']);
        if (sku) product.sku = sku;
        const brand = getValue(row, ['Brand']);
        if (brand) product.brand = brand;

        const pricing: any = {};
        const srp = getValue(row, ['SRP', 'Selling Price']);
        if (srp) pricing.srp = srp;
        if (Object.keys(pricing).length > 0) {
          product.pricing = pricing;
        }

        categoryObj.products.push(product);
        return acc;
      }, [] as any[]);

      const finalJson = { product_categories: categories };
      await chatDbService.saveProductData(finalJson, selectedPage?.id);
      setHasProductDb(true);
      alert('Product database loaded successfully!');
    } catch (err: any) {
      console.error(err);
      alert('Failed to parse Excel product catalog: ' + err.message);
    }
  };

  const handleDownloadBusinessTemplate = () => {
    const template = {
      businessInfo: {
        name: "SteadySocial Care",
        address: "Manila, Philippines",
        shippingInfo: "Flat rate 80 PHP nationwide via J&T Express.",
        paymentInfo: "GCash (0917-123-4567), PayMaya, or BDO bank transfer."
      }
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'business_info_template.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadProductTemplate = () => {
    const templateData = [
      {
        'Category': 'Skincare',
        'Product Name': 'Ultra Hydrating Niacinamide Serum',
        'Size': '30ml',
        'SKU': 'SKIN-SERUM-001',
        'Brand': 'SteadySocial Care',
        'SRP': 299.00
      },
      {
        'Category': 'Skincare',
        'Product Name': 'Gentle Foaming Cleanser',
        'Size': '100ml',
        'SKU': 'SKIN-CLEAN-002',
        'Brand': 'SteadySocial Care',
        'SRP': 199.00
      }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "products_template.xlsx");
  };

  if (isLoadingFbSettings) {
    return (
      <div className="min-h-full bg-neo-bg flex items-center justify-center font-space">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 neo-border bg-neo-accent animate-spin"></div>
          <p className="font-black uppercase tracking-widest text-xs">
            BOOTING_CORE...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 max-w-[1600px] w-full mx-auto">
        <div>
          <div className="inline-block bg-neo-accent text-white px-2 py-0.5 mb-2 neo-border-sm rotate-1">
            <span className="text-[10px] font-black uppercase tracking-widest">
              COMMUNICATIONS_PROTOCOL
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-neo-black leading-none">
            MESSENGER_
            <span className="text-neo-secondary outline-text">HUB</span>
          </h1>
        </div>

        <div className="w-full md:w-auto flex items-center gap-4">
          {isLoggedIn && (
            <Select
              id="fbPageSelect"
              value={selectedPage?.id || ''}
              onChange={handlePageChange}
              options={fbPages.map(page => ({
                value: page.id,
                label: (page.name || page.id).toUpperCase(),
              }))}
              placeholder="SELECT_NODE_TARGET"
              disabled={isLoadingPages || fbPages.length === 0}
            />
          )}
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

        {isLoggedIn && selectedPage ? (
          <div className="flex-grow flex gap-8 h-full w-full">
            {/* COLUMN 1: Active Threads */}
            <div className="w-80 flex flex-col gap-6 h-full">
              <Card
                title="INCOMING_THREADS"
                className="flex-grow !p-4 neo-shadow-md bg-neo-muted overflow-hidden flex flex-col h-full"
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectedPage && fetchConversations(selectedPage)}
                    disabled={isLoadingConversations}
                  >
                    <i
                      className={`fas fa-sync-alt ${
                        isLoadingConversations ? 'animate-spin' : ''
                      }`}
                    ></i>
                  </Button>
                }
              >
                {isLoadingConversations ? (
                  <div className="flex-grow flex items-center justify-center">
                    <div className="w-8 h-8 neo-border bg-neo-black animate-spin"></div>
                  </div>
                ) : (
                  <div className="flex-grow overflow-y-auto space-y-3 pr-2 max-h-[60vh]">
                    {conversations.map(conversation => {
                      const isAiEnabled = isConversationAiEnabled(conversation.id);
                      return (
                        <ConversationRow
                          key={conversation.id}
                          conversation={conversation}
                          selected={selectedConversationId === conversation.id}
                          selectedPageId={selectedPage.id}
                          onSelect={handleSelectConversation}
                          state={conversationStatesMap[conversation.id]}
                          isAiEnabled={isAiEnabled}
                        />
                      );
                    })}

                    {conversations.length === 0 && (
                      <p className="text-center py-20 font-black text-[10px] opacity-20 uppercase tracking-widest">
                        NO_THREADS_ACTIVE
                      </p>
                    )}
                  </div>
                )}
              </Card>
            </div>

            {/* COLUMN 2: Chat Stream */}
            <div className="flex-grow flex flex-col gap-6 h-full">
              <Card
                title={
                  selectedConversation
                    ? `STREAM: ${getParticipantName(
                        selectedConversation.participants?.data || [],
                        selectedPage.id
                      )}`
                    : 'IDLE_STREAM'
                }
                className="flex-grow neo-shadow-lg bg-white overflow-hidden flex flex-col !p-0 h-full"
                actions={
                  selectedConversation && (
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-50">
                        AI_AUTO_PILOT:
                      </span>

                      <button
                        type="button"
                        onClick={() => toggleAiForConversation(selectedConversation.id)}
                        className={`px-3 py-1 neo-border-sm text-[10px] font-black transition-all ${
                          isConversationAiEnabled(selectedConversation.id)
                            ? 'bg-neo-accent text-white'
                            : 'bg-neo-muted text-neo-black opacity-50'
                        }`}
                      >
                        {isConversationAiEnabled(selectedConversation.id) ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  )
                }
              >
                <div className="flex-grow overflow-y-auto p-8 space-y-6 bg-neo-bg/50 max-h-[50vh]">
                  {isLoadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-10 h-10 neo-border bg-neo-accent animate-bounce"></div>
                    </div>
                  ) : (
                    messages.map(message => {
                      const isMe = String(message.from.id) === String(selectedPage.id);

                      return (
                        <div
                          key={message.id}
                          className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] p-4 neo-border-sm relative group ${
                              isMe
                                ? 'bg-neo-black text-white rotate-1 shadow-none translate-x-0.5 translate-y-0.5'
                                : 'bg-white text-neo-black -rotate-1'
                            }`}
                          >
                            <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

                            <p className="text-xs font-bold leading-relaxed relative z-10 whitespace-pre-wrap">
                              {message.message}
                            </p>

                            <div
                              className={`mt-2 text-[8px] font-black uppercase tracking-widest opacity-40 ${
                                isMe ? 'text-white' : 'text-neo-black'
                              }`}
                            >
                              {new Date(message.created_time).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {selectedConversation && messages.length === 0 && !isLoadingMessages && (
                    <p className="text-center py-20 font-black text-[10px] opacity-20 uppercase tracking-widest">
                      ENCRYPTED_IDLE
                    </p>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {selectedConversation && !isWithin24HourWindow(selectedConversation) && (
                  <div className="p-3 bg-neo-accent text-white neo-border-sm m-6 mb-0">
                    <p className="text-[10px] font-black uppercase tracking-widest">
                      Reply window expired. The customer must message the Page again before you can send a normal reply.
                    </p>
                  </div>
                )}

                {selectedConversation && (
                  <form onSubmit={handleSendMessage} className="p-6 bg-neo-muted neo-border-t mt-auto">
                    <div className="flex gap-4">
                      <div className="w-full">
                        <Input
                          type="text"
                          value={newMessageText}
                          onChange={event => setNewMessageText(event.target.value)}
                          placeholder="TRANSMIT_MESSAGE..."
                          disabled={isSendingMessage || isLoadingMessages}
                          className="flex-grow !mb-0"
                        />
                      </div>

                      <Button
                        type="submit"
                        variant="primary"
                        isLoading={isSendingMessage}
                        disabled={isSendingMessage || !newMessageText.trim()}
                      >
                        SEND
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            </div>

            {/* COLUMN 3: CRM Console & AI Database Settings */}
            <div className="w-96 flex flex-col gap-6 h-full">
              <Card
                title="CRM_CONSOLE"
                className="flex-grow !p-4 neo-shadow-md bg-neo-muted overflow-hidden flex flex-col h-full"
              >
                {/* Equal Flex Tab Switcher inside Card Body */}
                <div className="flex gap-1 border-4 border-neo-black bg-neo-black p-0.5 mb-4 -rotate-1 w-full">
                  <button
                    type="button"
                    onClick={() => setIsCrmTab('crm')}
                    className={`flex-1 text-center py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${
                      isCrmTab === 'crm'
                        ? 'bg-neo-accent text-white'
                        : 'bg-white text-neo-black hover:bg-neo-secondary'
                    }`}
                  >
                    CRM
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCrmTab('autopilot')}
                    className={`flex-1 text-center py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${
                      isCrmTab === 'autopilot'
                        ? 'bg-neo-accent text-white'
                        : 'bg-white text-neo-black hover:bg-neo-secondary'
                    }`}
                  >
                    AUTOPILOT
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCrmTab('database')}
                    className={`flex-1 text-center py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${
                      isCrmTab === 'database'
                        ? 'bg-neo-accent text-white'
                        : 'bg-white text-neo-black hover:bg-neo-secondary'
                    }`}
                  >
                    DATABASE
                  </button>
                </div>
                {selectedConversation ? (
                  isCrmTab === 'crm' ? (
                    <div className="flex flex-col gap-5 h-full overflow-y-auto pr-1 pb-10 max-h-[60vh]">
                      {/* Sentiment Panel */}
                      <div className="flex justify-between items-center bg-white p-3 neo-border-sm -rotate-1">
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-widest opacity-50">SENTIMENT_DETECTOR</p>
                          <span className={`inline-block mt-1 px-2.5 py-0.5 text-[10px] font-black uppercase neo-border-sm ${
                            conversationState?.sentiment === 'positive'
                              ? 'bg-green-400 text-neo-black rotate-2'
                              : conversationState?.sentiment === 'negative'
                              ? 'bg-red-400 text-white -rotate-2'
                              : 'bg-yellow-400 text-neo-black'
                          }`}>
                            {conversationState?.sentiment
                              ? `${conversationState.sentiment === 'positive' ? '😊' : conversationState.sentiment === 'negative' ? '😠' : '😐'} ${conversationState.sentiment}`
                              : 'UNKNOWN'}
                          </span>
                        </div>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            if (isCrmLoading) return;
                            setIsCrmLoading(true);
                            try {
                              let historicalMessages = messages;
                              if (fbApi && selectedPage?.access_token) {
                                try {
                                  const historyResponse = await fbApi<{ data: FacebookMessage[] }>(
                                    `/${selectedConversation.id}/messages`,
                                    'get',
                                    {
                                      fields: 'id,created_time,message,from{id,name}',
                                      limit: 150,
                                      access_token: selectedPage.access_token,
                                    }
                                  );
                                  if (historyResponse?.data) {
                                    historicalMessages = sortMessagesByCreatedTime(historyResponse.data);
                                  }
                                } catch (histErr) {
                                  console.warn('Failed to load larger chat history for AI extraction:', histErr);
                                }
                              }

                              const chatMessages: ChatMessage[] = historicalMessages.map(msg => ({
                                id: msg.id,
                                created_time: msg.created_time,
                                message: msg.message,
                                from: { id: msg.from.id, name: msg.from.name }
                              }));
                              const sentiment = await detectSentimentFromChat(chatMessages, selectedPage?.id || '', callAI);
                              if (sentiment) {
                                await chatDbService.saveSentiment(selectedConversation.id, sentiment, selectedPage?.id);
                              }
                              const details = await extractCustomerDetailsFromChat(chatMessages, selectedPage?.id || '', callAI);
                              if (details.fullName || details.contactNumber || details.email || details.address) {
                                const merged = {
                                  fullName: details.fullName || detailsState.fullName || '',
                                  contactNumber: details.contactNumber || detailsState.contactNumber || '',
                                  email: details.email || detailsState.email || '',
                                  address: details.address || detailsState.address || ''
                                };
                                await chatDbService.saveCustomerDetails(selectedConversation.id, merged, selectedPage?.id);
                                setDetailsState(merged);
                                await syncLeadToCore(selectedConversation.id, merged);
                              }

                              if (details.tags && details.tags.length > 0) {
                                await chatDbService.saveTags(selectedConversation.id, details.tags, selectedPage?.id);
                                setTagsText(details.tags.join(', '));
                              }

                              if (details.remarks) {
                                await chatDbService.saveRemarks(selectedConversation.id, details.remarks, selectedPage?.id);
                                setRemarksText(details.remarks);
                              }

                              const state = await chatDbService.getConversationState(selectedConversation.id, selectedPage?.id);
                              setConversationState(state);
                              refreshStatesMap();
                            } catch (e) {
                              console.error(e);
                            } finally {
                              setIsCrmLoading(false);
                            }
                          }}
                          disabled={isCrmLoading}
                          className="!py-1"
                        >
                          {isCrmLoading ? 'SYNCING...' : 'RUN_AI_EXTRACT'}
                        </Button>
                      </div>

                      {/* CRM Funnel Stage Roadmap */}
                      <div className="bg-white p-3 neo-border-sm">
                        <p className="text-[8px] font-black uppercase tracking-widest opacity-50 mb-2">CRM_FUNNEL_STAGE</p>
                        <div className="grid grid-cols-3 gap-2">
                          {stages.map((stage, idx) => {
                            const isActive = conversationState?.customerStatus === stage;
                            return (
                              <button
                                type="button"
                                key={stage}
                                onClick={() => handleSetCustomerStatus(stage)}
                                className={`p-1 text-[9px] font-black uppercase tracking-wider text-center transition-all neo-border-sm ${
                                  isActive
                                    ? 'bg-neo-accent text-white scale-105 shadow-none'
                                    : 'bg-neo-muted text-neo-black opacity-60 hover:opacity-100'
                                }`}
                              >
                                {idx + 1}. {stage}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Customer Details Form */}
                      <div className="bg-white p-3 neo-border-sm rotate-1">
                        <p className="text-[8px] font-black uppercase tracking-widest opacity-50 mb-3">CUSTOMER_PROFILE_FIELDS</p>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">FULL_NAME</label>
                            <Input
                              type="text"
                              value={detailsState.fullName || ''}
                              onChange={e => setDetailsState(prev => ({ ...prev, fullName: e.target.value }))}
                              placeholder="NO_NAME_DETECTED"
                              className="!p-2 text-xs !mb-0"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">CONTACT_NUMBER</label>
                            <Input
                              type="text"
                              value={detailsState.contactNumber || ''}
                              onChange={e => setDetailsState(prev => ({ ...prev, contactNumber: e.target.value }))}
                              placeholder="NO_CONTACT_NUMBER_DETECTED"
                              className="!p-2 text-xs !mb-0"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">EMAIL_ADDRESS</label>
                            <Input
                              type="text"
                              value={detailsState.email || ''}
                              onChange={e => setDetailsState(prev => ({ ...prev, email: e.target.value }))}
                              placeholder="NO_EMAIL_DETECTED"
                              className="!p-2 text-xs !mb-0"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">SHIPPING_ADDRESS</label>
                            <textarea
                              value={detailsState.address || ''}
                              onChange={e => setDetailsState(prev => ({ ...prev, address: e.target.value }))}
                              placeholder="NO_ADDRESS_DETECTED"
                              className="w-full text-xs font-bold p-2 neo-border-sm bg-neo-bg focus:bg-white focus:outline-none min-h-[50px] resize-none"
                            />
                          </div>

                          <Button
                            variant="primary"
                            size="sm"
                            onClick={async () => {
                              if (!selectedConversation) return;
                              await chatDbService.saveCustomerDetails(selectedConversation.id, detailsState, selectedPage?.id);
                              await syncLeadToCore(selectedConversation.id, detailsState);
                              refreshStatesMap();
                              alert('Customer profile details updated and synced to Lead Core!');
                            }}
                            className="w-full"
                          >
                            SAVE_PROFILE
                          </Button>
                        </div>
                      </div>

                      {/* Custom Tags */}
                      <div className="bg-white p-3 neo-border-sm -rotate-1">
                        <p className="text-[8px] font-black uppercase tracking-widest opacity-50 mb-2">CONVERSATION_TAGS</p>
                        <Input
                          type="text"
                          value={tagsText}
                          onChange={e => setTagsText(e.target.value)}
                          placeholder="VIP, Hot Lead, Skincare (comma separated)"
                          className="!p-2 text-xs !mb-2"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            if (!selectedConversation) return;
                            const newTags = tagsText.split(',').map(t => t.trim()).filter(Boolean);
                            await chatDbService.saveTags(selectedConversation.id, newTags, selectedPage?.id);
                            setConversationState(prev => prev ? { ...prev, tags: newTags } : null);
                            refreshStatesMap();
                            alert('Tags updated successfully!');
                          }}
                          className="w-full"
                        >
                          UPDATE_TAGS
                        </Button>
                      </div>

                      {/* Agent Remarks sticky note */}
                      <div className="bg-yellow-100 dark:bg-yellow-900 p-4 border-4 border-dashed border-yellow-500 neo-border-sm rotate-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-yellow-800 dark:text-yellow-200 mb-2">📌 AGENT_REMARKS</p>
                        <textarea
                          value={remarksText}
                          onChange={e => setRemarksText(e.target.value)}
                          placeholder="Add custom instructions or sticky remarks that the chatbot will read during auto-responses..."
                          className="w-full text-xs font-bold p-2 neo-border-sm bg-white dark:bg-slate-800 focus:outline-none min-h-[80px]"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            if (!selectedConversation) return;
                            await chatDbService.saveRemarks(selectedConversation.id, remarksText, selectedPage?.id);
                            setConversationState(prev => prev ? { ...prev, remarks: remarksText } : null);
                            refreshStatesMap();
                            alert('Agent remarks saved successfully!');
                          }}
                          className="w-full mt-2 bg-yellow-400 text-neo-black border-neo-black hover:bg-yellow-500"
                        >
                          SAVE_REMARKS
                        </Button>
                      </div>
                    </div>
                  ) : isCrmTab === 'database' ? (
                    <div className="flex flex-col gap-5 h-full overflow-y-auto pr-1 max-h-[60vh]">
                      {/* Business FAQ Database Import */}
                      <div className="bg-white p-4 neo-border-sm -rotate-1">
                        <div className="flex justify-between items-center mb-3">
                          <p className="text-[10px] font-black uppercase tracking-widest">BUSINESS_INFO_DB</p>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 neo-border-sm ${hasBusinessDb ? 'bg-green-400 text-neo-black' : 'bg-red-400 text-white'}`}>
                            {hasBusinessDb ? 'LOADED' : 'MISSING'}
                          </span>
                        </div>

                        <p className="text-[9px] font-bold opacity-60 mb-4">
                          Upload a business FAQ JSON structure for the selected Facebook page.
                        </p>

                        <div className="space-y-3">
                          <input
                            type="file"
                            accept=".json"
                            onChange={handleBusinessImport}
                            className="hidden"
                            id="businessJsonInput"
                          />
                          <label
                            htmlFor="businessJsonInput"
                            className="block text-center p-3 neo-border-sm bg-neo-muted text-xs font-black uppercase cursor-pointer hover:bg-neo-secondary"
                          >
                            <i className="fas fa-file-upload mr-2"></i> UPLOAD_BUSINESS_JSON
                          </label>

                          <button
                            type="button"
                            onClick={handleDownloadBusinessTemplate}
                            className="w-full text-center text-[9px] font-black uppercase tracking-widest text-neo-secondary hover:underline cursor-pointer"
                          >
                            <i className="fas fa-file-download mr-1"></i> DOWNLOAD_JSON_TEMPLATE
                          </button>
                        </div>
                      </div>

                      {/* Product Catalog Database Import */}
                      <div className="bg-white p-4 neo-border-sm rotate-1">
                        <div className="flex justify-between items-center mb-3">
                          <p className="text-[10px] font-black uppercase tracking-widest">PRODUCT_CATALOG_DB</p>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 neo-border-sm ${hasProductDb ? 'bg-green-400 text-neo-black' : 'bg-red-400 text-white'}`}>
                            {hasProductDb ? 'LOADED' : 'MISSING'}
                          </span>
                        </div>

                        <p className="text-[9px] font-bold opacity-60 mb-4">
                          Upload an Excel product sheet (.xlsx) for the selected Facebook page product finder.
                        </p>

                        <div className="space-y-3">
                          <input
                            type="file"
                            accept=".xlsx"
                            onChange={handleProductImport}
                            className="hidden"
                            id="productExcelInput"
                          />
                          <label
                            htmlFor="productExcelInput"
                            className="block text-center p-3 neo-border-sm bg-neo-muted text-xs font-black uppercase cursor-pointer hover:bg-neo-secondary"
                          >
                            <i className="fas fa-file-excel mr-2"></i> UPLOAD_PRODUCTS_EXCEL
                          </label>

                          <button
                            type="button"
                            onClick={handleDownloadProductTemplate}
                            className="w-full text-center text-[9px] font-black uppercase tracking-widest text-neo-secondary hover:underline cursor-pointer"
                          >
                            <i className="fas fa-file-download mr-1"></i> DOWNLOAD_EXCEL_TEMPLATE
                          </button>
                        </div>
                      </div>

                      <div className="bg-neo-muted p-3 neo-border-sm text-[10px] font-bold text-center">
                        If this page has no local database, AI Agent falls back to this page's Settings knowledge base context.
                      </div>
                    </div>
                  ) : (
                    // AI Autopilot Configuration Panel
                    <div className="flex flex-col gap-5 h-full overflow-y-auto pr-1 pb-10 max-h-[60vh]">
                      {/* AI Autopilot Switch */}
                      <div className="bg-white p-4 neo-border-sm -rotate-1">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">AUTOPILOT_STATUS</p>
                        <div className="flex justify-between items-center gap-2">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 neo-border-sm ${isConversationAiEnabled(selectedConversation.id) ? 'bg-neo-accent text-white animate-pulse' : 'bg-neo-muted text-neo-black'}`}>
                            {isConversationAiEnabled(selectedConversation.id) ? 'ACTIVE & ONLINE' : 'INACTIVE / MANUAL'}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleAiForConversation(selectedConversation.id)}
                            className={`px-3 py-1.5 neo-border-sm text-[10px] font-black uppercase tracking-widest transition-all ${
                              isConversationAiEnabled(selectedConversation.id)
                                ? 'bg-red-500 text-white hover:bg-red-600'
                                : 'bg-neo-secondary text-neo-black hover:bg-neo-accent hover:text-white'
                            }`}
                          >
                            {isConversationAiEnabled(selectedConversation.id) ? 'DEACTIVATE' : 'ACTIVATE'}
                          </button>
                        </div>
                      </div>

                      {/* Response Mode Selector */}
                      <div className="bg-white p-4 neo-border-sm rotate-1">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-3">RESPONSE_AUTOPILOT_MODE</p>
                        <div className="space-y-3">
                          {[
                            { value: 'continuous', label: '🔄 Continuous Conversation', desc: 'AI replies to every incoming customer query automatically.' },
                            { value: 'single_shot', label: '⚡ Single Auto-Reply', desc: 'AI replies once, then turns off autopilot for human takeover.' },
                            { value: 'follow_up', label: '⏰ Follow-Up Mode Only', desc: 'No normal auto-replies. AI only re-engages when silent.' }
                          ].map(mode => {
                            const isSelected = (conversationState?.autopilotMode || 'continuous') === mode.value;
                            return (
                              <button
                                type="button"
                                key={mode.value}
                                onClick={async () => {
                                  await chatDbService.saveAutopilotMode(selectedConversation.id, mode.value as any, selectedPage?.id);
                                  setConversationState(prev => prev ? { ...prev, autopilotMode: mode.value as any } : null);
                                }}
                                className={`w-full text-left p-3 neo-border-sm transition-all flex flex-col gap-1 ${
                                  isSelected
                                    ? 'bg-neo-secondary text-neo-black border-neo-black translate-x-[2px] translate-y-[2px] shadow-none'
                                    : 'bg-neo-muted text-neo-black/60 opacity-80 hover:opacity-100'
                                }`}
                              >
                                <span className="text-[10px] font-black uppercase tracking-tight">{mode.label}</span>
                                <span className="text-[9px] font-bold opacity-80">{mode.desc}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Database Context Status Indicators */}
                      <div className="bg-white p-4 neo-border-sm -rotate-1">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">INTELLIGENT_CONTEXT_STATUS</p>
                        <div className="space-y-2 mb-3">
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span>🏢 Business Info FAQ:</span>
                            <span className={`px-1.5 py-0.5 neo-border-sm font-black text-[9px] ${hasBusinessDb ? 'bg-green-400 text-neo-black' : 'bg-red-400 text-white'}`}>
                              {hasBusinessDb ? 'ONLINE' : 'OFFLINE'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span>📦 Product Catalog DB:</span>
                            <span className={`px-1.5 py-0.5 neo-border-sm font-black text-[9px] ${hasProductDb ? 'bg-green-400 text-neo-black' : 'bg-red-400 text-white'}`}>
                              {hasProductDb ? 'ONLINE' : 'OFFLINE'}
                            </span>
                          </div>
                        </div>

                        {matchedProductsPreview.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-neo-black/10">
                            <p className="text-[9px] font-black uppercase tracking-widest text-neo-accent mb-2">🎯 MATCHED PRODUCTS FOR LAST QUERY:</p>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {matchedProductsPreview.map((prod, idx) => (
                                <div key={idx} className="bg-neo-muted p-2 neo-border-sm text-[9px] font-bold flex justify-between items-center">
                                  <div>
                                    <div className="font-black text-neo-black uppercase">{prod.name}</div>
                                    <div className="opacity-60 text-[8px]">{prod.category} • SKU: {prod.sku || 'N/A'}</div>
                                  </div>
                                  <div className="font-black text-neo-accent bg-white px-1.5 py-0.5 neo-border-sm text-[9px]">
                                    ₱{prod.price || 'N/A'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Follow-Up Assistant */}
                      <div className="bg-white p-4 neo-border-sm rotate-1">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-3">FOLLOW_UP_ASSISTANT</p>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">SELECT_FOLLOW_UP_TONE</label>
                            <select
                              value={selectedFollowUpTone}
                              onChange={async (e) => {
                                const tone = e.target.value;
                                setSelectedFollowUpTone(tone);
                                await chatDbService.saveFollowUpTone(selectedConversation.id, tone, selectedPage?.id);
                                setConversationState(prev => prev ? { ...prev, followUpTone: tone } : null);
                              }}
                              className="w-full text-xs font-bold p-2 neo-border-sm bg-neo-bg focus:outline-none focus:bg-white text-neo-black"
                            >
                              <option value="warm">😊 Warm & Friendly Check-in</option>
                              <option value="reminder">🛒 Pending Order Checkout Reminder</option>
                              <option value="offer">🎁 Promo & Exclusive Offer</option>
                              <option value="advice">💖 Skincare Advice & Support</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleDraftFollowUp}
                              disabled={isDraftingFollowUp}
                              className="w-full text-[10px] uppercase font-black"
                            >
                              {isDraftingFollowUp ? 'DRAFTING...' : '⚡ DRAFT_FOLLOW_UP'}
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={async () => {
                                if (isDraftingFollowUp) return;
                                // Automatically generate and directly send
                                setIsDraftingFollowUp(true);
                                try {
                                  let businessInfo = await chatDbService.getBusinessData(selectedPage?.id);
                                  if (!businessInfo) {
                                    businessInfo = {
                                      businessInfo: { name: selectedPage?.name || 'our business' },
                                      faq: selectedPageContext,
                                    };
                                  }
                                  const allProducts = await chatDbService.getProductData(selectedPage?.id) || { product_categories: [] };
                                  const chatMessages: ChatMessage[] = messages.map(msg => ({
                                    id: msg.id,
                                    created_time: msg.created_time,
                                    message: msg.message,
                                    from: { id: msg.from.id, name: msg.from.name },
                                  }));
                                  const { reply } = await generateAutoReply(
                                    chatMessages,
                                    selectedPage?.id || '',
                                    true,
                                    conversationState?.remarks || '',
                                    callAI,
                                    businessInfo,
                                    allProducts,
                                    selectedFollowUpTone
                                  );
                                  if (reply) {
                                    await handleSendMessage(undefined, reply);
                                    alert('AI Follow-up sent directly!');
                                  }
                                } catch (e) {
                                  console.error(e);
                                  alert('Failed to send follow-up.');
                                } finally {
                                  setIsDraftingFollowUp(false);
                                }
                              }}
                              disabled={isDraftingFollowUp}
                              className="w-full text-[10px] uppercase font-black"
                            >
                              🚀 DIRECT_SEND
                            </Button>
                          </div>

                          {followUpDraftText && (
                            <div className="space-y-2 mt-3 pt-3 border-t border-neo-black/10">
                              <label className="block text-[8px] font-black uppercase tracking-widest opacity-60">EDITABLE_FOLLOW_UP_DRAFT</label>
                              <textarea
                                value={followUpDraftText}
                                onChange={e => setFollowUpDraftText(e.target.value)}
                                className="w-full text-xs font-bold p-2 neo-border-sm bg-neo-bg focus:bg-white focus:outline-none min-h-[100px] resize-none"
                              />
                              <div className="flex gap-2">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={async () => {
                                    await handleSendMessage(undefined, followUpDraftText);
                                    setFollowUpDraftText('');
                                    alert('Customized follow-up sent!');
                                  }}
                                  className="flex-grow text-[9px] uppercase font-black"
                                >
                                  SEND_DRAFTED_MESSAGE
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setFollowUpDraftText('')}
                                  className="text-[9px] uppercase font-black bg-red-400 text-white border-neo-black hover:bg-red-500"
                                >
                                  DISCARD
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                    <i className="fas fa-user-tag text-4xl mb-4"></i>
                    <p className="text-[10px] font-black uppercase tracking-widest">SELECT_A_THREAD_TO_LOAD_CRM</p>
                  </div>
                )}
              </Card>
            </div>
          </div>
        ) : (
          <div className="flex-grow flex items-center justify-center">
            <div className="text-center space-y-6">
              <div className="w-32 h-32 neo-border bg-neo-muted mx-auto flex items-center justify-center -rotate-3 neo-shadow-md">
                <i
                  className={`fas ${
                    !isLoggedIn ? 'fa-key' : 'fa-comment-slash'
                  } text-6xl text-neo-black opacity-20`}
                ></i>
              </div>

              <p className="font-black uppercase tracking-[0.2em] text-neo-black/40 text-xs">
                {!isLoggedIn ? 'ACCESS_TOKEN_REQUIRED' : 'AWAITING_NODE_SELECTION'}
              </p>

              {!isLoggedIn && (
                <p className="text-[10px] font-bold text-neo-black/50">
                  Configure your access token in Settings to connect.
                </p>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 mt-8 text-center">
        <div className="inline-block px-4 py-2 bg-neo-black text-white neo-border-sm -rotate-1">
          <p className="text-[8px] font-black uppercase tracking-[0.4em]">
            ENCRYPTED_COMMS_PORT // v1.0.0 // STATUS:{' '}
            {isLoggedIn ? 'SECURE' : 'SYNCING'}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default FacebookChatsPage;
