
import { useState, useEffect, useCallback, useRef } from 'react';
import { SocialPlatform, CaptionTone } from '../types'; 
import { WEBLLM_CREATIVE_MODEL, WEBLLM_CHATBOT_MODEL } from '../constants';

const CHATBOT_SYSTEM_INSTRUCTION = "You are SteadySocial AI, a friendly and expert social media copywriter. When asked for content, provide a few distinct options with relevant hashtags and emojis. Give clear, actionable advice when asked. Format responses with markdown. Do not use `<End-of-Turn>` or `<think>` tags.";

const captionWorkerScript = `
  import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

  let engine = null;
  let isModelLoaded = false;
  let currentModelName = '';

  self.onmessage = async (event) => {
    const { type, payload } = event.data;

    if (type === 'init') {
      // If a different model is requested, or no model is loaded, initialize.
      if ((isModelLoaded && engine && currentModelName !== payload.model) || !isModelLoaded) {
        if (engine) {
          // If there's an old engine, unload it first.
          // This assumes CreateMLCEngine might not handle re-init well without explicit unload.
          // Depending on WebLLM's internal handling, this might be overly cautious or necessary.
          // For simplicity, we're assuming CreateMLCEngine can be called again to switch models,
          // or that for separate workers, this re-initialization logic per worker is fine.
          // await engine.unload(); // engine.unload() may not exist or work this way.
          // isModelLoaded = false;
        }
      } else if (isModelLoaded && engine && currentModelName === payload.model) {
         self.postMessage({ type: 'init-done', payload: { model: currentModelName, message: "Model already loaded." } });
         return;
      }
      
      currentModelName = payload.model; // Store the model name being initialized
      try {
        const appConfig = { useIndexedDBCache: true };
        engine = await CreateMLCEngine(payload.model, {
          initProgressCallback: (progress) => {
            self.postMessage({ type: 'progress', payload: { ...progress, model: payload.model } });
          },
        }, appConfig);
        isModelLoaded = true;
        self.postMessage({ type: 'init-done', payload: { model: payload.model, message: "Model loaded successfully!" } });
      } catch (error) {
        self.postMessage({ type: 'error', payload: { model: payload.model, message: 'Failed to initialize model: ' + (error instanceof Error ? error.message : String(error)) } });
      }
    }

    if (type === 'generate-text') {
      if (!engine || !isModelLoaded) { self.postMessage({ type: 'error', payload: { model: currentModelName, message: "Model not initialized." } }); return; }
      try {
        const messages = [{ role: 'user', content: payload.prompt }];
        const chunks = await engine.chat.completions.create({ messages, stream: true });
        let result = '';
        for await (const chunk of chunks) {
          const content = chunk.choices[0]?.delta?.content || '';
          result += content;
        }
        self.postMessage({ type: 'text-result', payload: { ...payload, result } });
      } catch (err) {
        self.postMessage({ type: 'error', payload: { model: currentModelName, message: 'Text generation failed: ' + (err instanceof Error ? err.message : String(err)) } });
      }
    }

    if (type === 'generate-chat') {
      if (!engine || !isModelLoaded) {
        self.postMessage({ type: 'error', payload: { model: currentModelName, message: "Model not initialized." } });
        return;
      }
      try {
        const chunks = await engine.chat.completions.create({
          messages: payload.messages,
          stream: true
        });
        
        let fullResponse = "";
        for await (const chunk of chunks) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullResponse += content;
            self.postMessage({ type: 'chat-chunk', payload: { chunk: content, requestId: payload.requestId } });
          }
        }
        
        self.postMessage({ type: 'chat-complete', payload: { fullResponse, requestId: payload.requestId } });
      } catch (err) {
        self.postMessage({ type: 'error', payload: { model: currentModelName, message: 'Chat generation failed: ' + (err instanceof Error ? err.message : String(err)) } });
      }
    }
  };
`;

interface GenerateInitialCanvasItemsProps {
  customPrompt: string;
  textFileContent: string | null;
  platform: SocialPlatform;
  tone: CaptionTone;
  numberOfIdeas: number;
}

interface GenerateChatResponseProps {
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk: (chunk: string) => void;
}

interface AdaptCanvasItemProps {
  itemId: string;
  originalText: string;
  targetPlatform: SocialPlatform;
  baseTone: CaptionTone;
  customPrompt: string;
  textFileContent: string | null;
}

type TextResultPayload = {
  result: string;
  requestType: 'initialCanvasItems' | 'adaptCanvasItem' | 'suggestPrompt';
  originalItemId?: string;
  targetPlatform?: SocialPlatform;
  originalTitle?: string;
};

type WorkerMessagePayload = {
  text?: string;
  model: string; // To identify which model's progress/error it is
  message?: string; // For errors or init-done messages
};

type CreativePendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

type ChatbotPendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  onChunk?: (chunk: string) => void;
};


const useWebLLM = () => {
  const creativeWorkerRef = useRef<Worker | null>(null);
  const chatbotWorkerRef = useRef<Worker | null>(null);

  const [creativeModelLoaded, setCreativeModelLoaded] = useState(false);
  const [creativeModelProgress, setCreativeModelProgress] = useState('');
  const [chatbotModelLoaded, setChatbotModelLoaded] = useState(false);
  const [chatbotModelProgress, setChatbotModelProgress] = useState('');

  const [isLoadingInitialItems, setIsLoadingInitialItems] = useState(false);
  const [isLoadingAdaptation, setIsLoadingAdaptation] = useState<Record<string, Partial<Record<SocialPlatform, boolean>>>>({});
  const [isLoadingPromptSuggestion, setIsLoadingPromptSuggestion] = useState(false);
  const [isLoadingChatMessage, setIsLoadingChatMessage] = useState(false);

  const [error, setError] = useState<string | null>(null); // General error for now
  const [rawAIResponse, setRawAIResponse] = useState<string | null>(null);
  const [suggestAIPrompt, setSuggestAIPrompt] = useState<string | null>(null);
  const [requestType, setRequestType] = useState<string | null>(null); // For creative worker text results

  const pendingCreativeRequests = useRef<Record<string, CreativePendingRequest>>({});
  const pendingChatbotRequests = useRef<Record<string, ChatbotPendingRequest>>({});

  const cleanAIResponseString = (rawText: string): string => {
    return String(rawText)
      .replace(/<End-of-Turn>/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gs, '')
      .replace(/^(here's your suggestion:|here's the adapted text:|adapted text for \w+:|suggested prompt:|certainly, here is the suggestion:|here's a prompt:)\s*/im, '')
      .replace(/```(?:\w+\n)?([\s\S]+)```/, '$1')
      .replace(/["'*`_~]/g, '')
      .trim();
  };

  // useEffect(() => {
  //   const blob = new Blob([captionWorkerScript], { type: 'application/javascript' });
  //   const workerScriptURL = URL.createObjectURL(blob);

  //   // Initialize Creative Worker
  //   const newCreativeWorker = new Worker(workerScriptURL, { type: 'module' });
  //   creativeWorkerRef.current = newCreativeWorker;
  //   newCreativeWorker.onmessage = (event: MessageEvent<any>) => {
  //     const { type, payload } = event.data as { type: string; payload: any };
  //     switch (type) {
  //       case 'progress':
  //         setCreativeModelProgress((payload as WorkerMessagePayload).text || 'Processing...');
  //         break;
  //       case 'init-done':
  //         setCreativeModelLoaded(true);
  //         setCreativeModelProgress((payload as WorkerMessagePayload).message || 'Creative model ready.');
  //         break;
  //       case 'text-result':
  //         {
  //           const { result, requestType: reqType, originalItemId, targetPlatform, originalTitle } = payload as TextResultPayload;
  //           if (reqType === 'suggestPrompt') setSuggestAIPrompt(result);
  //           else setRawAIResponse(result);
  //           setRequestType(reqType);

  //           let requestId = '';
  //           if (reqType === 'initialCanvasItems') requestId = 'initialCanvasItems';
  //           else if (reqType === 'adaptCanvasItem' && originalItemId && targetPlatform) requestId = `adapt-${originalItemId}-${targetPlatform}`;
  //           else if (reqType === 'suggestPrompt' && originalTitle) requestId = `suggestPrompt-${originalTitle}`;
            
  //           if (requestId && pendingCreativeRequests.current[requestId]) {
  //             pendingCreativeRequests.current[requestId].resolve(result);
  //             delete pendingCreativeRequests.current[requestId];
  //           }

  //           if (reqType === 'initialCanvasItems') setIsLoadingInitialItems(false);
  //           else if (reqType === 'adaptCanvasItem' && originalItemId && targetPlatform) {
  //             setIsLoadingAdaptation(prev => ({ ...prev, [originalItemId]: { ...prev[originalItemId], [targetPlatform]: false } }));
  //           } else if (reqType === 'suggestPrompt') setIsLoadingPromptSuggestion(false);
  //         }
  //         break;
  //       case 'error':
  //         {
  //           const errorPayload = payload as WorkerMessagePayload;
  //           const errorMessage = errorPayload.message || 'An unknown error occurred in the creative AI worker.';
  //           setError(`Creative Model Error: ${errorMessage}`);
  //           setCreativeModelProgress('Error encountered.');
  //           // Reject relevant pending requests
  //           Object.values(pendingCreativeRequests.current).forEach((p: CreativePendingRequest) => p.reject(new Error(errorMessage)));
  //           pendingCreativeRequests.current = {};
  //           setIsLoadingInitialItems(false);
  //           setIsLoadingAdaptation({});
  //           setIsLoadingPromptSuggestion(false);
  //         }
  //         break;
  //     }
  //   };
  //   setCreativeModelProgress('Initializing Creative AI model...');
  //   newCreativeWorker.postMessage({ type: 'init', payload: { model: WEBLLM_CREATIVE_MODEL } });

  //   // Initialize Chatbot Worker
  //   const newChatbotWorker = new Worker(workerScriptURL, { type: 'module' });
  //   chatbotWorkerRef.current = newChatbotWorker;
  //   newChatbotWorker.onmessage = (event: MessageEvent<any>) => {
  //     const { type, payload } = event.data as { type: string; payload: any };
  //     switch (type) {
  //       case 'progress':
  //         setChatbotModelProgress((payload as WorkerMessagePayload).text || 'Processing...');
  //         break;
  //       case 'init-done':
  //         setChatbotModelLoaded(true);
  //         setChatbotModelProgress((payload as WorkerMessagePayload).message || 'Chatbot model ready.');
  //         break;
  //       case 'chat-chunk':
  //         {
  //           const { chunk, requestId } = payload;
  //           const request = pendingChatbotRequests.current[requestId];
  //           if (request && request.onChunk) request.onChunk(chunk);
  //         }
  //         break;
  //       case 'chat-complete':
  //         {
  //           const { fullResponse, requestId } = payload;
  //           const request = pendingChatbotRequests.current[requestId];
  //           if (request) {
  //             request.resolve(fullResponse);
  //             delete pendingChatbotRequests.current[requestId];
  //           }
  //           setIsLoadingChatMessage(false);
  //         }
  //         break;
  //       case 'error':
  //         {
  //           const errorPayload = payload as WorkerMessagePayload;
  //           const errorMessage = errorPayload.message || 'An unknown error occurred in the chatbot AI worker.';
  //           setError(`Chatbot Model Error: ${errorMessage}`); // Consider if this should be a separate error state
  //           setChatbotModelProgress('Error encountered.');
  //            // Reject relevant pending requests
  //           Object.values(pendingChatbotRequests.current).forEach((p: ChatbotPendingRequest) => p.reject(new Error(errorMessage)));
  //           pendingChatbotRequests.current = {};
  //           setIsLoadingChatMessage(false);
  //         }
  //         break;
  //     }
  //   };
  //   setChatbotModelProgress('Initializing Chatbot AI model...');
  //   newChatbotWorker.postMessage({ type: 'init', payload: { model: WEBLLM_CHATBOT_MODEL } });
    
  //   return () => {
  //     newCreativeWorker.terminate();
  //     newChatbotWorker.terminate();
  //     URL.revokeObjectURL(workerScriptURL);
  //   };
  // }, []);

  const generateInitialCanvasItems = useCallback((props: GenerateInitialCanvasItemsProps): Promise<string[]> => {
    return new Promise<string[]>((resolve, reject) => {
      if (!creativeWorkerRef.current || !creativeModelLoaded) {
        const err = "Creative AI Model is not ready.";
        setError(err); return reject(new Error(err));
      }
      if (!props.customPrompt && !props.textFileContent) {
        const err = "Please provide some input for idea generation.";
        setError(err); return reject(new Error(err));
      }
      setIsLoadingInitialItems(true); setError(null);
      pendingCreativeRequests.current['initialCanvasItems'] = {
        resolve: (rawText: string) => {
          const posts: string[] = [];
          const matches = rawText.matchAll(/^\s*\d+\.\s*([\s\S]*?)(?=\n\s*\d+\.|$)/gm);
          for (const match of matches) {
            if (match[1]) {
              const cleanedPost = match[1].trim();
              if (cleanedPost) posts.push(cleanedPost);
            }
          }
          if (posts.length === 0) {
            const fallbackPosts = rawText.split('\n\n').map(p => cleanAIResponseString(p)).filter(p => p.length > 10);
            if (fallbackPosts.length === 0) return reject(new Error("AI response could not be parsed."));
            try {
              const parsed = JSON.parse(rawText);
              if (Array.isArray(parsed)) {
                const trimmed = parsed.map((s) => String(s).trim()).filter(Boolean);
                if (trimmed.length > 0) {
                  return resolve(trimmed.slice(0, props.numberOfIdeas));
                }
              }
            } catch (_) {
              resolve(fallbackPosts.slice(0, props.numberOfIdeas));
            }
          } else {
            resolve(posts.slice(0, props.numberOfIdeas));
          }
        },
        reject
      };
      const prompt = `Act as an expert social media copywriter.
      Your task is to write exactly ${props.numberOfIdeas} distinct social media posts based on the provided details. The posts should be varied in structure, style, and length.
      Platform Context: ${props.platform}
      Desired Tone: ${props.tone}
      Core Message/Prompt: ${props.customPrompt}
      Additional details from text file: ${props.textFileContent || 'None'}

      IMPORTANT: You must respond ONLY with a valid JSON array of strings, where each string is a complete, ready-to-use social media post. Do not write a strategy or ideas for posts; write the posts themselves.

      Example Response:
      [
        "Is it a latte kind of morning or a black coffee day? 🤔 Let us know your go-to order in the comments! #MorningRitual #CoffeeQuestion #TheDailyGrind",
        "Behind every cup of our Signature Roast is a story. 🌱\\n\\nWe partner with a family-run farm in the highlands of Colombia, where these beans are hand-picked and sun-dried to perfection. The result? A smooth, balanced flavor with notes of caramel and citrus.\\n\\nIt’s more than just coffee; it’s a connection. #BeanToCup #EthicalSourcing #CoffeeStory #CraftedWithCare",
        "Ready to perfect your French Press? Here are 3 quick tips:\\n1️⃣ Use coarse ground beans (like our House Blend!)\\n2️⃣ Steep for exactly 4 minutes.\\n3️⃣ Press the plunger down slowly and steadily.\\nEnjoy that perfect cup! ☕️ #CoffeeTips #HomeBarista #BrewGuide",
        "Our Summer Cold Brew is back for a limited time! ☀️🧊 Tag a friend who needs this in their life ASAP. 👇 #ColdBrew #SummerVibes #LimitedEdition #TagAFriend",
        "That Friday feeling, powered by our place. ✨ Show us how you're enjoying your weekend coffee by tagging us! #WeekendCoffee #CommunityLove #CoffeeShopVibes"
      ]
      `;
      creativeWorkerRef.current.postMessage({ type: 'generate-text', payload: { prompt, requestType: 'initialCanvasItems' } });
    });
  }, [creativeModelLoaded]);

  const adaptCanvasItem = useCallback((props: AdaptCanvasItemProps): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!creativeWorkerRef.current || !creativeModelLoaded) {
        const err = "Creative AI Model is not ready for adaptation.";
        setError(err); return reject(new Error(err));
      }
      setIsLoadingAdaptation(prev => ({ ...prev, [props.itemId]: { ...prev[props.itemId], [props.targetPlatform]: true } }));
      setError(null);
      const requestId = `adapt-${props.itemId}-${props.targetPlatform}`;
      pendingCreativeRequests.current[requestId] = {
        resolve: (rawText: string) => resolve(cleanAIResponseString(rawText)),
        reject
      };
      const prompt = `Adapt the following social media text specifically for the ${props.targetPlatform} platform.
      Original Idea Text: "${props.originalText}"
      Original Tone for context: ${props.baseTone}
      Key Message/Topic from original prompt: ${props.customPrompt || 'General content based on original text.'}
      Platform-specific Instructions:
      - For X (formerly Twitter): Concise (under 280 chars), 1-3 relevant hashtags.
      - For LinkedIn: Professional tone (200-500 words), call-to-action/question, professional hashtags.
      - For Instagram: Strong visual hook, 5-10 relevant hashtags/emojis.
      - For Facebook: 1-3 engaging paragraphs, encourage comments.
      - For TikTok: Short, catchy description (under 150 chars), trending/relevant hashtags.
      IMPORTANT: Your output must ONLY be the adapted text itself. No conversational lead-in, platform adapted, explanation, or markdown.`;
      creativeWorkerRef.current.postMessage({ type: 'generate-text', payload: { prompt, requestType: 'adaptCanvasItem', originalItemId: props.itemId, targetPlatform: props.targetPlatform }});
    });
  }, [creativeModelLoaded]);

  const suggestPromptForCanvasTitle = useCallback((title: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!creativeWorkerRef.current || !creativeModelLoaded) {
        const err = "Creative AI Model is not ready for prompt suggestion.";
        setError(err); return reject(new Error(err));
      }
      if (!title.trim()) {
        const err = "Canvas title is required.";
        setError(err); return reject(new Error(err));
      }
      setIsLoadingPromptSuggestion(true); setError(null);
      const requestId = `suggestPrompt-${title}`;
      pendingCreativeRequests.current[requestId] = {
        resolve: (rawText: string) => resolve(cleanAIResponseString(rawText)),
        reject
      };
      const promptToAI = `Your job is to write a single, effective sentence I can use as a prompt to generate social media posts.
      The topic is: "${title}"
      CRITICAL: Respond with ONLY the prompt itself. Do not say "Here is a prompt" or anything else.
      EXAMPLE: 
      If topic was "Our New Sustainable Coffee Blend", 
      respond: "Generate social media posts about our new eco-friendly coffee, focusing on rich taste, sustainable sourcing, and how it improves the morning ritual."
      Now, write the prompt for the topic: "${title}"`;
      creativeWorkerRef.current.postMessage({ type: 'generate-text', payload: { prompt: promptToAI, requestType: 'suggestPrompt', originalTitle: title } });
    });
  }, [creativeModelLoaded]);

  const generateChatResponse = useCallback((props: GenerateChatResponseProps): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      if (!chatbotWorkerRef.current || !chatbotModelLoaded) {
        const err = "Chatbot AI Model is not ready.";
        setError(err); return reject(new Error(err));
      }
      setIsLoadingChatMessage(true); setError(null);
      const requestId = `chat-${Date.now()}`;
      pendingChatbotRequests.current[requestId] = { resolve, reject, onChunk: props.onChunk };
      const messagesForEngine = [
        { role: 'system', content: CHATBOT_SYSTEM_INSTRUCTION },
        ...props.history,
        { role: 'user', content: props.userMessage }
      ];
      chatbotWorkerRef.current.postMessage({ type: 'generate-chat', payload: { messages: messagesForEngine, requestId } });
    });
  }, [chatbotModelLoaded]);

  return {
    creativeModelLoaded,
    creativeModelProgress,
    chatbotModelLoaded,
    chatbotModelProgress,
    isLoadingInitialItems,
    isLoadingAdaptation,
    isLoadingPromptSuggestion,
    isLoadingChatMessage,
    error,
    rawAIResponse, 
    suggestAIPrompt, 
    requestType, 
    generateInitialCanvasItems,
    adaptCanvasItem,
    suggestPromptForCanvasTitle,
    setError,
    generateChatResponse,
  };
};

export default useWebLLM;
