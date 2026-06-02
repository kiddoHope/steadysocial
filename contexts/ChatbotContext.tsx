import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { useAI } from './AIContext';
import { useAuth } from './AuthContext';
import {
  dbCreateCampaign,
  dbGetCampaigns,
} from '../services/campaignService';
import {
  dbCreateAutomation,
  dbGetAutomations,
  AutomationAction,
  AutomationTrigger,
} from '../services/automationService';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatbotContextType {
  isChatOpen: boolean;
  toggleChat: () => void;
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  pendingAgentPlan: AgentPlan | null;
  cancelPendingAgentPlan: () => void;
}

type AgentMode = 'chat' | 'tool' | 'clarify';

type AgentIntent =
  | 'GENERAL_CHAT'
  | 'GENERATE_CONTENT'
  | 'CREATE_CAMPAIGN'
  | 'VIEW_CAMPAIGNS'
  | 'CREATE_AUTOMATION'
  | 'VIEW_AUTOMATIONS'
  | 'VIEW_ANALYTICS'
  | 'UNKNOWN';

type AgentToolName =
  | 'createCampaign'
  | 'viewCampaigns'
  | 'createAutomation'
  | 'viewAutomations'
  | 'generateContent'
  | 'viewAnalytics'
  | null;

interface AgentPlan {
  mode: AgentMode;
  intent: AgentIntent;
  tool: AgentToolName;
  confidence: number;
  requiresConfirmation: boolean;
  arguments: Record<string, any>;
  assistantMessage: string;
}

type GenerateChatResponse = (props: {
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk: (chunk: string) => void;
}) => Promise<string>;

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined);

const confirmationWords = [
  'yes',
  'confirm',
  'confirmed',
  'proceed',
  'go ahead',
  'do it',
  'create it',
  'continue',
  'approve',
  'okay',
  'ok',
  'sure',
];

const cancellationWords = [
  'no',
  'cancel',
  'stop',
  'never mind',
  'nevermind',
  'dont',
  "don't",
  'do not',
  'abort',
];

const skillMap: Array<{
  id: string;
  path: string;
  keywords: string[];
}> = [
  {
    id: 'social-content',
    path: '/skills/my-skills/social-content/SKILL.md',
    keywords: ['caption', 'post', 'facebook', 'instagram', 'social media', 'content'],
  },
  {
    id: 'ad-creative',
    path: '/skills/my-skills/ad-creative/SKILL.md',
    keywords: ['ad', 'ads', 'creative', 'headline', 'hook', 'campaign copy'],
  },
  {
    id: 'copywriting',
    path: '/skills/my-skills/copywriting/SKILL.md',
    keywords: ['copy', 'copywriting', 'rewrite', 'sales copy'],
  },
  {
    id: 'content-strategy',
    path: '/skills/my-skills/content-strategy/SKILL.md',
    keywords: ['strategy', 'content plan', 'calendar', 'monthly plan'],
  },
  {
    id: 'analytics-tracking',
    path: '/skills/my-skills/analytics-tracking/SKILL.md',
    keywords: ['analytics', 'reach', 'engagement', 'followers', 'insights'],
  },
  {
    id: 'launch-strategy',
    path: '/skills/my-skills/launch-strategy/SKILL.md',
    keywords: ['launch', 'product launch', 'go to market', 'promo launch'],
  },
];

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeText = (text: string) => text.trim().toLowerCase();

const isConfirmation = (text: string) => {
  const normalized = normalizeText(text);
  return confirmationWords.some(word => normalized === word || normalized.includes(word));
};

const isCancellation = (text: string) => {
  const normalized = normalizeText(text);
  return cancellationWords.some(word => normalized === word || normalized.includes(word));
};

const safeJsonParse = (text: string): AgentPlan | null => {
  try {
    const cleaned = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
      return null;
    }

    const jsonText = cleaned.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonText);

    return {
      mode: parsed.mode || 'chat',
      intent: parsed.intent || 'GENERAL_CHAT',
      tool: parsed.tool ?? null,
      confidence: Number(parsed.confidence ?? 0.5),
      requiresConfirmation: Boolean(parsed.requiresConfirmation),
      arguments: parsed.arguments && typeof parsed.arguments === 'object' ? parsed.arguments : {},
      assistantMessage: String(parsed.assistantMessage || 'I can help with that.'),
    };
  } catch (error) {
    console.error('Agent plan parse failed:', error);
    return null;
  }
};

const detectSkillId = (userMessage: string): string | null => {
  const text = normalizeText(userMessage);

  const matched = skillMap.find(skill =>
    skill.keywords.some(keyword => text.includes(keyword.toLowerCase()))
  );

  return matched?.id || null;
};

const loadSkillInstruction = async (skillId: string | null): Promise<string> => {
  if (!skillId) return '';

  const skill = skillMap.find(item => item.id === skillId);
  if (!skill) return '';

  try {
    const response = await fetch(skill.path);

    if (!response.ok) {
      console.warn(`Skill file not found: ${skill.path}`);
      return '';
    }

    return await response.text();
  } catch (error) {
    console.error('Failed to load skill instruction:', error);
    return '';
  }
};

const buildPlannerPrompt = (userMessage: string) => `
You are the planning brain of SteadySocial, an agentic marketing operating system.

You do not execute tools directly. You only decide the next best step.

Available tools:
1. createCampaign
2. viewCampaigns
3. createAutomation
4. viewAutomations
5. generateContent
6. viewAnalytics

Important rules:
- Return JSON only. No markdown. No explanation outside JSON.
- If the user asks to create, update, delete, schedule, send, publish, or change saved data, set requiresConfirmation to true.
- If the user asks to view or list existing data, set requiresConfirmation to false.
- If important details are missing, use mode "clarify".
- If the user wants content, captions, strategy, copy, or ideas, use mode "chat" or tool "generateContent" with requiresConfirmation false.
- For campaign creation, extract name, budget, startDate, endDate when present. If missing, use reasonable draft placeholders, but still require confirmation.
- For automation creation, extract name, trigger, action, and actionValue when present. If missing, use reasonable placeholders, but still require confirmation.
- Never claim that a tool has already run. The app will execute tools after your plan.

User message:
${userMessage}

Return exactly this JSON shape:
{
  "mode": "chat" | "tool" | "clarify",
  "intent": "GENERAL_CHAT" | "GENERATE_CONTENT" | "CREATE_CAMPAIGN" | "VIEW_CAMPAIGNS" | "CREATE_AUTOMATION" | "VIEW_AUTOMATIONS" | "VIEW_ANALYTICS" | "UNKNOWN",
  "tool": "createCampaign" | "viewCampaigns" | "createAutomation" | "viewAutomations" | "generateContent" | "viewAnalytics" | null,
  "confidence": 0.0,
  "requiresConfirmation": true,
  "arguments": {},
  "assistantMessage": "Natural message to show the user"
}
`;

const createFallbackPlan = (userMessage: string): AgentPlan => {
  const text = normalizeText(userMessage);

  if (text.includes('campaign') && (text.includes('show') || text.includes('list') || text.includes('view'))) {
    return {
      mode: 'tool',
      intent: 'VIEW_CAMPAIGNS',
      tool: 'viewCampaigns',
      confidence: 0.75,
      requiresConfirmation: false,
      arguments: {},
      assistantMessage: 'I will check your campaigns.',
    };
  }

  if (text.includes('campaign') && (text.includes('create') || text.includes('make') || text.includes('add'))) {
    const roughName = userMessage
      .replace(/create|make|add|new|campaign|for/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      mode: 'tool',
      intent: 'CREATE_CAMPAIGN',
      tool: 'createCampaign',
      confidence: 0.7,
      requiresConfirmation: true,
      arguments: {
        name: roughName || 'New AI Campaign',
        budget: '₱0',
        status: 'DRAFT',
      },
      assistantMessage: `I can create a draft campaign named "${roughName || 'New AI Campaign'}" with no budget set yet. Do you want me to create it now?`,
    };
  }

  if (text.includes('automation') || text.includes('auto reply') || text.includes('workflow')) {
    return {
      mode: 'tool',
      intent: 'CREATE_AUTOMATION',
      tool: 'createAutomation',
      confidence: 0.65,
      requiresConfirmation: true,
      arguments: {
        name: 'AI Auto Reply Workflow',
        trigger: 'NEW_MESSAGE_RECEIVED',
        action: 'SEND_AUTO_REPLY',
      },
      assistantMessage: 'I can create an automation for new Messenger messages. Do you want me to create it now?',
    };
  }

  return {
    mode: 'chat',
    intent: 'GENERAL_CHAT',
    tool: null,
    confidence: 0.4,
    requiresConfirmation: false,
    arguments: {},
    assistantMessage: '',
  };
};

const createAgentPlan = async (props: {
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  generateChatResponse: GenerateChatResponse;
}): Promise<AgentPlan> => {
  const { userMessage, history, generateChatResponse } = props;

  try {
    const rawPlan = await generateChatResponse({
      userMessage: buildPlannerPrompt(userMessage),
      history,
      onChunk: () => {},
    });

    const parsedPlan = safeJsonParse(rawPlan);

    if (!parsedPlan) {
      return createFallbackPlan(userMessage);
    }

    return parsedPlan;
  } catch (error) {
    console.error('Agent planning failed:', error);
    return createFallbackPlan(userMessage);
  }
};

const executeAgentTool = async (plan: AgentPlan): Promise<string> => {
  const args = plan.arguments || {};

  switch (plan.tool) {
    case 'createCampaign': {
      const campaign = await dbCreateCampaign({
        name: args.name || args.campaignName || 'New AI Campaign',
        budget: args.budget || '₱0',
        status: args.status || 'DRAFT',
        startDate: args.startDate || new Date().toISOString().split('T')[0],
        endDate: args.endDate || '',
      });

      return [
        'Done. I created the campaign.',
        '',
        `Campaign: ${campaign.name}`,
        `Status: ${campaign.status}`,
        `Budget: ${campaign.budget}`,
      ].join('\n');
    }

    case 'viewCampaigns': {
      const campaigns = await dbGetCampaigns();

      if (!campaigns.length) {
        return 'You do not have any campaigns yet.';
      }

      return [
        'Here are your campaigns:',
        '',
        ...campaigns.map(
          campaign => `• ${campaign.name} | ${campaign.status} | ${campaign.budget || 'No budget set'}`
        ),
      ].join('\n');
    }

    case 'createAutomation': {
      const trigger = (args.trigger || 'NEW_MESSAGE_RECEIVED') as AutomationTrigger;
      const action = (args.action || 'SEND_AUTO_REPLY') as AutomationAction;

      const rule = await dbCreateAutomation({
        name: args.name || 'AI Automation Workflow',
        trigger,
        action,
        actionValue: args.actionValue || '',
        isEnabled: true,
      });

      return [
        'Done. I created the automation rule.',
        '',
        `Workflow: ${rule.name}`,
        `Trigger: ${rule.trigger}`,
        `Action: ${rule.action}`,
      ].join('\n');
    }

    case 'viewAutomations': {
      const automations = await dbGetAutomations();

      if (!automations.length) {
        return 'You do not have any automation rules yet.';
      }

      return [
        'Here are your automation rules:',
        '',
        ...automations.map(
          rule => `• ${rule.name} | ${rule.isEnabled ? 'Active' : 'Inactive'} | ${rule.trigger} → ${rule.action}`
        ),
      ].join('\n');
    }

    case 'viewAnalytics': {
      return 'I can help interpret analytics, but direct analytics tool access is not connected inside the chatbot yet. Open the Analytics page to sync the latest metrics, then ask me to explain them.';
    }

    default:
      return 'I understood the request, but this tool is not connected yet.';
  }
};

const buildAgentChatPrompt = (props: {
  userMessage: string;
  plan: AgentPlan;
  skillInstruction: string;
}) => {
  const { userMessage, plan, skillInstruction } = props;

  return `
You are SteadySocial Agent, an agentic marketing assistant inside the user's marketing operating system.

You can help with:
- Social captions and campaign content
- Marketing strategy
- Copywriting
- Analytics interpretation
- Campaign planning
- Automation planning

Current planner decision:
${JSON.stringify(plan, null, 2)}

Loaded skill instructions:
${skillInstruction || 'No specific skill instructions were loaded.'}

User request:
${userMessage}

Response rules:
- Answer naturally and practically.
- Do not say you executed an action unless a tool result is provided.
- For content generation, give ready-to-use output.
- For missing details, ask a clear question.
- Keep it professional and direct.
`;
};

export const ChatbotProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatbotError, setChatbotError] = useState<string | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [pendingAgentPlan, setPendingAgentPlan] = useState<AgentPlan | null>(null);

  const {
    generateChatResponse,
    isLoadingChatMessage: isWebLLMLoadingChat,
    error: webLLMError,
    setError: setWebLLMError,
    chatbotModelLoaded,
  } = useAI();

  const { currentUser } = useAuth();

  const storageKey = useMemo(
    () => currentUser ? `steadysocial_chat_history_${currentUser.id}` : 'steadysocial_chat_history',
    [currentUser?.id]
  );

  const pendingStorageKey = useMemo(
    () => currentUser ? `steadysocial_pending_agent_plan_${currentUser.id}` : 'steadysocial_pending_agent_plan',
    [currentUser?.id]
  );

  const defaultMessages = useMemo<ChatMessage[]>(
    () => [
      {
        id: createId('ai-greeting'),
        role: 'assistant',
        content:
          "Hello! I'm SteadySocial Agent. I can help create content, plan campaigns, review marketing ideas, and prepare actions for your approval.",
        timestamp: Date.now(),
      },
    ],
    []
  );

  const appendAssistantMessage = useCallback((content: string) => {
    setMessages(prev => [
      ...prev,
      {
        id: createId('assistant'),
        role: 'assistant',
        content,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const updateAssistantMessage = useCallback((messageId: string, content: string) => {
    setMessages(prev =>
      prev.map(message =>
        message.id === messageId ? { ...message, content } : message
      )
    );
  }, []);

  const clearError = useCallback(() => {
    setChatbotError(null);
    setWebLLMError(null);
  }, [setWebLLMError]);

  const cancelPendingAgentPlan = useCallback(() => {
    setPendingAgentPlan(null);
    localStorage.removeItem(pendingStorageKey);
  }, [pendingStorageKey]);

  const toggleChat = useCallback(() => {
    setIsChatOpen(prev => !prev);

    if (!isChatOpen) {
      clearError();
    }
  }, [clearError, isChatOpen]);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ChatMessage[];
        setMessages(parsed);
        return;
      } catch (error) {
        console.error('Failed to parse chat history:', error);
      }
    }

    setMessages(defaultMessages);
  }, [defaultMessages, storageKey]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, storageKey]);

  useEffect(() => {
    const saved = localStorage.getItem(pendingStorageKey);

    if (!saved) {
      setPendingAgentPlan(null);
      return;
    }

    try {
      setPendingAgentPlan(JSON.parse(saved));
    } catch (error) {
      console.error('Failed to parse pending agent plan:', error);
      localStorage.removeItem(pendingStorageKey);
    }
  }, [pendingStorageKey]);

  useEffect(() => {
    if (pendingAgentPlan) {
      localStorage.setItem(pendingStorageKey, JSON.stringify(pendingAgentPlan));
    }
  }, [pendingAgentPlan, pendingStorageKey]);

  useEffect(() => {
    if (webLLMError) {
      setChatbotError(webLLMError);
    }
  }, [webLLMError]);

  const sendMessage = useCallback(
    async (text: string) => {
      const cleanText = text.trim();

      if (!cleanText) return;

      if (!chatbotModelLoaded) {
        setChatbotError('AI model is not ready. Please wait for it to load.');
        return;
      }

      clearError();
      setIsAgentRunning(true);

      const userMessage: ChatMessage = {
        id: createId('user'),
        role: 'user',
        content: cleanText,
        timestamp: Date.now(),
      };

      const historyForAI = messages.map(message => ({
        role: message.role,
        content: message.content,
      }));

      const assistantMessageId = createId('assistant');
      const assistantPlaceholder: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, userMessage, assistantPlaceholder]);

      try {
        if (pendingAgentPlan) {
          if (isCancellation(cleanText)) {
            cancelPendingAgentPlan();
            updateAssistantMessage(assistantMessageId, 'Okay, I cancelled that pending action.');
            return;
          }

          if (isConfirmation(cleanText)) {
            const result = await executeAgentTool(pendingAgentPlan);
            cancelPendingAgentPlan();
            updateAssistantMessage(assistantMessageId, result);
            return;
          }

          const clarificationPrompt = `
The user has a pending action waiting for confirmation.

Pending action:
${JSON.stringify(pendingAgentPlan, null, 2)}

User reply:
${cleanText}

Respond naturally. If they are changing details, update the proposed plan in plain language and ask for confirmation again. Do not execute anything.
`;

          const response = await generateChatResponse({
            userMessage: clarificationPrompt,
            history: historyForAI,
            onChunk: chunk => {
              setMessages(prev =>
                prev.map(message =>
                  message.id === assistantMessageId
                    ? { ...message, content: message.content + chunk }
                    : message
                )
              );
            },
          });

          updateAssistantMessage(assistantMessageId, response);
          return;
        }

        const plan = await createAgentPlan({
          userMessage: cleanText,
          history: historyForAI,
          generateChatResponse,
        });

        if (plan.mode === 'clarify') {
          updateAssistantMessage(assistantMessageId, plan.assistantMessage);
          return;
        }

        if (plan.mode === 'tool' && plan.requiresConfirmation) {
          setPendingAgentPlan(plan);
          updateAssistantMessage(assistantMessageId, plan.assistantMessage);
          return;
        }

        if (plan.mode === 'tool' && !plan.requiresConfirmation) {
          const result = await executeAgentTool(plan);
          updateAssistantMessage(assistantMessageId, result);
          return;
        }

        const skillInstruction = await loadSkillInstruction(detectSkillId(cleanText));

        const finalPrompt = buildAgentChatPrompt({
          userMessage: cleanText,
          plan,
          skillInstruction,
        });

        const finalContent = await generateChatResponse({
          userMessage: finalPrompt,
          history: historyForAI,
          onChunk: chunk => {
            setMessages(prev =>
              prev.map(message =>
                message.id === assistantMessageId
                  ? { ...message, content: message.content + chunk }
                  : message
              )
            );
          },
        });

        updateAssistantMessage(assistantMessageId, finalContent);
      } catch (error: any) {
        const errorMessage = error?.message || 'An error occurred while communicating with the AI agent.';
        setChatbotError(errorMessage);
        updateAssistantMessage(assistantMessageId, `Error: ${errorMessage}`);
      } finally {
        setIsAgentRunning(false);
      }
    },
    [
      cancelPendingAgentPlan,
      chatbotModelLoaded,
      clearError,
      generateChatResponse,
      messages,
      pendingAgentPlan,
      updateAssistantMessage,
    ]
  );

  return (
    <ChatbotContext.Provider
      value={{
        isChatOpen,
        toggleChat,
        messages,
        sendMessage,
        isLoading: isWebLLMLoadingChat || isAgentRunning,
        error: chatbotError,
        clearError,
        pendingAgentPlan,
        cancelPendingAgentPlan,
      }}
    >
      {children}
    </ChatbotContext.Provider>
  );
};

export const useChatbot = (): ChatbotContextType => {
  const context = useContext(ChatbotContext);

  if (context === undefined) {
    throw new Error('useChatbot must be used within a ChatbotProvider');
  }

  return context;
};
