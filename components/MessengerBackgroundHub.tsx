import React, { useEffect, useRef, useState, useCallback } from 'react';
import { dbGetFacebookSettings, dbSaveFacebookSettings } from '../services/settingsService';
import { chatDbService, CustomerDetails } from '../services/chatDbService';
import { generateAutoReply, extractCustomerDetailsFromChat, determineCustomerStatusFromChat, detectSentimentFromChat, ChatMessage } from '../services/messengerAiService';
import useFacebookSDK from '../hooks/useFacebookSDK';
import { dbGetLeads, dbUpdateLead, dbCreateLead } from '../services/crmService';
import { useAI } from '../contexts/AIContext';
import { FacebookMessage, FacebookSettings } from '../types';

const POLLING_INTERVAL_MS = 1000; // 1 seconds

const sortMessagesByCreatedTime = (items: FacebookMessage[]): FacebookMessage[] => {
  return [...items].sort(
    (a, b) => new Date(a.created_time || 0).getTime() - new Date(b.created_time || 0).getTime()
  );
};

const MessengerBackgroundHub: React.FC = () => {
  const [fbSettings, setFbSettings] = useState<FacebookSettings | null>(null);
  const { callAI } = useAI();
  const { fbApi } = useFacebookSDK(fbSettings?.appId, undefined, fbSettings?.accessToken);
  const lastProcessedMsgIdRef = useRef<Record<string, string>>({});
  const isGeneratingRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await dbGetFacebookSettings();
        setFbSettings(settings);
      } catch (err) {
        console.error('[Hub] Failed to load FB settings:', err);
      }
    };
    loadSettings();
    
    // Refresh settings periodically to catch AI enable/disable changes
    const interval = setInterval(loadSettings, 15000);
    return () => clearInterval(interval);
  }, []);

  const syncLeadToCore = async (conversationId: string, details: CustomerDetails) => {
    if (!details.fullName) return;
    try {
      const leads = await dbGetLeads();
      const existingLead = leads.find(l => l.messengerConversationId === conversationId);

      let fbGender = '';
      if (fbApi && fbSettings?.accessToken) {
        try {
          const response = await fbApi<{ participants?: { data: any[] } }>(`/${conversationId}`, 'get', {
            fields: 'participants',
            access_token: fbSettings.accessToken,
          });
          const customerId = response?.participants?.data?.find(
            p => String(p.id) !== String(fbSettings.pageId)
          )?.id;

          if (customerId) {
            const profile = await fbApi<{ gender?: string }>(`/${customerId}`, 'get', {
              fields: 'gender',
              access_token: fbSettings.accessToken,
            });
            if (profile?.gender) {
              fbGender = profile.gender;
            }
          }
        } catch (err) {
          console.warn('[Hub] Failed to fetch profile from FB:', err);
        }
      }

      const leadData = {
        name: details.fullName,
        phone: details.contactNumber || undefined,
        email: details.email || undefined,
        address: details.address || undefined,
        gender: fbGender || (details as any).gender || undefined,
        age: (details as any).age || undefined,
        notes: [
          details.address ? `Address: ${details.address}` : undefined,
          fbGender ? `Gender (Meta): ${fbGender}` : undefined,
        ].filter(Boolean).join('\n') || undefined,
        source: 'MESSENGER' as const,
        status: (existingLead?.status || 'NEW') as any,
        messengerConversationId: conversationId,
      };

      if (existingLead) {
        await dbUpdateLead(existingLead.id, leadData);
      } else {
        await dbCreateLead(leadData);
      }
    } catch (err) {
      console.warn('[Hub] Failed to sync lead to Core:', err);
    }
  };

  const processConversation = useCallback(async (conversationId: string) => {
    if (!fbApi || !fbSettings?.accessToken || !fbSettings.pageId || isGeneratingRef.current[conversationId]) {
      return;
    }

    try {
      isGeneratingRef.current[conversationId] = true;

      // 1. Fetch latest messages
      const response = await fbApi<{ data: FacebookMessage[] }>(
        `/${conversationId}/messages`,
        'get',
        {
          fields: 'id,created_time,message,from{id,name,email}',
          limit: 25,
          access_token: fbSettings.accessToken,
        }
      );

      const messages = sortMessagesByCreatedTime(response.data || []);
      if (!messages.length) return;

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage?.id || lastProcessedMsgIdRef.current[conversationId] === lastMessage.id) {
        return;
      }

      const isFromCustomer = String(lastMessage.from.id) !== String(fbSettings.pageId);
      if (!isFromCustomer) {
        // If the last message is from the page, just update the ref
        lastProcessedMsgIdRef.current[conversationId] = lastMessage.id;
        return;
      }

      // Also set the last processed ID immediately to prevent further retries on the exact same message if we fail later.
      // We will only retry if a NEW message comes in.
      lastProcessedMsgIdRef.current[conversationId] = lastMessage.id;

      const currentConvState = await chatDbService.getConversationState(conversationId);
      const autopilotMode = currentConvState.autopilotMode || 'continuous';

      // CRM Background Sync
      const chatMessages: ChatMessage[] = messages.map(msg => ({
        id: msg.id,
        created_time: msg.created_time,
        message: msg.message,
        from: { id: msg.from.id, name: msg.from.name },
      }));

      let stateUpdated = false;

      const nextStatus = await determineCustomerStatusFromChat(
        chatMessages,
        fbSettings.pageId,
        currentConvState.customerStatus || 'New'
      );
      if (nextStatus !== currentConvState.customerStatus) {
        await chatDbService.saveCustomerStatus(conversationId, nextStatus);
        stateUpdated = true;
      }

      const details = await extractCustomerDetailsFromChat(chatMessages, fbSettings.pageId, callAI);
      if (details.fullName || details.contactNumber || details.email || details.address) {
        const mergedDetails = {
          fullName: details.fullName || currentConvState.customerDetails?.fullName || '',
          contactNumber: details.contactNumber || currentConvState.customerDetails?.contactNumber || '',
          email: details.email || currentConvState.customerDetails?.email || '',
          address: details.address || currentConvState.customerDetails?.address || '',
        };
        await chatDbService.saveCustomerDetails(conversationId, mergedDetails);
        await syncLeadToCore(conversationId, mergedDetails);
        stateUpdated = true;
      }

      if (details.tags && details.tags.length > 0) {
        await chatDbService.saveTags(conversationId, details.tags);
        stateUpdated = true;
      }
      if (details.remarks) {
        await chatDbService.saveRemarks(conversationId, details.remarks);
        stateUpdated = true;
      }

      const sentiment = await detectSentimentFromChat(chatMessages, fbSettings.pageId, callAI);
      if (sentiment) {
        await chatDbService.saveSentiment(conversationId, sentiment);
        stateUpdated = true;
      }

      if (stateUpdated) {
        window.dispatchEvent(new CustomEvent('messenger:crm_updated', { detail: { conversationId } }));
      }

      // Autopilot Reply
      if (autopilotMode === 'follow_up') {
        lastProcessedMsgIdRef.current[conversationId] = lastMessage.id;
        return;
      }

      window.dispatchEvent(new CustomEvent('messenger:generating', { detail: { conversationId, isGenerating: true } }));

      let businessInfo = await chatDbService.getBusinessData();
      if (!businessInfo) {
        businessInfo = {
          businessInfo: { name: 'our business' },
          faq: fbSettings.aiAgentContext,
        };
      }
      const allProducts = await chatDbService.getProductData() || { product_categories: [] };

      const { reply, handoff } = await generateAutoReply(
        chatMessages,
        fbSettings.pageId,
        false,
        currentConvState.remarks || '',
        callAI,
        businessInfo,
        allProducts
      );

      if (reply) {
        // Send reply
        const customerId = isFromCustomer ? lastMessage.from.id : chatMessages.find(m => String(m.from.id) !== String(fbSettings.pageId))?.from.id;

        if (customerId) {
          await fbApi(`/${fbSettings.pageId}/messages`, 'post', {
            messaging_type: 'RESPONSE',
            recipient: JSON.stringify({ id: customerId }),
            message: JSON.stringify({ text: reply }),
            access_token: fbSettings.accessToken,
          });

          window.dispatchEvent(new CustomEvent('messenger:message_sent', { detail: { conversationId } }));

          if (handoff || autopilotMode === 'single_shot') {
            const currentEnabled = fbSettings.aiEnabledConversations || [];
            const newEnabled = currentEnabled.filter(id => id !== conversationId);
            setFbSettings(prev => prev ? { ...prev, aiEnabledConversations: newEnabled } : null);
            await dbSaveFacebookSettings({ aiEnabledConversations: newEnabled });
            await chatDbService.toggleAi(conversationId, 'disabled');
          }
        }
      }

      lastProcessedMsgIdRef.current[conversationId] = lastMessage.id;
    } catch (err) {
      console.error(`[Hub] Error processing conversation ${conversationId}:`, err);
    } finally {
      isGeneratingRef.current[conversationId] = false;
      window.dispatchEvent(new CustomEvent('messenger:generating', { detail: { conversationId, isGenerating: false } }));
    }
  }, [fbApi, fbSettings, callAI]);

  useEffect(() => {
    if (!fbApi || !fbSettings?.aiEnabledConversations?.length) return;

    const intervalId = window.setInterval(() => {
      fbSettings.aiEnabledConversations?.forEach(convId => {
        processConversation(convId);
      });
    }, POLLING_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [fbApi, fbSettings, processConversation]);

  return null; // This component runs purely in the background
};

export default MessengerBackgroundHub;
