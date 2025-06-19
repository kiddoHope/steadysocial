import { useState, useEffect, useCallback } from 'react';
import { SocialPlatform, CaptionTone, CanvasItem } from '../types'; // Assuming CanvasItem might be needed elsewhere
import { WEBLLM_SELECTED_MODEL } from '../constants';

const CHATBOT_SYSTEM_INSTRUCTION = "You are SteadySocial AI, an expert copywriter, caption maker, and professional social media manager. You are friendly, insightful, and provide actionable advice and creative suggestions for social media content. When asked for captions or copy, provide a few distinct options unless specified otherwise. Format your responses clearly, using markdown for lists, bolding, etc., where appropriate. When generating social media posts, consider including relevant hashtags and emojis. If asked for general advice, provide clear, step-by-step guidance. Do not use `<End-of-Turn>` or `<think>` tags in your response.";

const captionWorkerScript = `
  import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

  let engine = null;
  let isModelLoaded = false;

  self.onmessage = async (event) => {
    const { type, payload } = event.data;

    if (type === 'init') {
      // ... (This part is correct and does not need changes)
      if (isModelLoaded && engine) {
        self.postMessage({ type: 'init-done', payload: "Model already loaded." });
        return;
      }
      try {
        const appConfig = { useIndexedDBCache: true };
        engine = await CreateMLCEngine(payload.model, {
          initProgressCallback: (progress) => {
            self.postMessage({ type: 'progress', payload: progress });
          },
        }, appConfig);
        isModelLoaded = true;
        self.postMessage({ type: 'init-done', payload: "Model loaded successfully!" });
      } catch (error) {
        self.postMessage({ type: 'error', payload: 'Failed to initialize model: ' + (error instanceof Error ? error.message : String(error)) });
      }
    }

    if (type === 'generate-text') {
      // ... (This is for canvas items and is correct, no changes needed)
      if (!engine || !isModelLoaded) { /* ... error handling ... */ return; }
      try {
        const messages = [{ role: 'user', content: payload.prompt }];
        const chunks = await engine.chat.completions.create({ messages, stream: true });
        let result = '';
        for await (const chunk of chunks) {
          const content = chunk.choices[0]?.delta?.content || '';
          result += content;
        }
        self.postMessage({ type: 'text-result', payload: { ...payload, result } });
      } catch (err) { /* ... error handling ... */ }
    }

    // ++ FIX: Add a new, dedicated handler for chat messages ++
    if (type === 'generate-chat') {
        if (!engine || !isModelLoaded) {
            self.postMessage({ type: 'error', payload: "Model not initialized." });
            return;
        }
        try {
            const chunks = await engine.chat.completions.create({
                messages: payload.messages, // Use the full message history from the hook
                stream: true 
            });
            
            let fullResponse = "";
            // Stream back each chunk as it arrives
            for await (const chunk of chunks) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) {
                    fullResponse += content;
                    // Post a 'chunk' message for real-time streaming
                    self.postMessage({ type: 'chat-chunk', payload: { chunk: content, requestId: payload.requestId } });
                }
            }
            
            // Signal that the full response is complete
            self.postMessage({ type: 'chat-complete', payload: { fullResponse, requestId: payload.requestId } });

        } catch (err) {
            self.postMessage({ type: 'error', payload: 'Chat generation failed: ' + (err instanceof Error ? err.message : String(err)) });
        }
    }
  };
`;

// Interface definitions (no changes needed here)
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

// Main hook implementation
const useWebLLM = () => {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelProgress, setModelProgress] = useState('');

  const [isLoadingInitialItems, setIsLoadingInitialItems] = useState(false);
  const [isLoadingAdaptation, setIsLoadingAdaptation] = useState<Record<string, Partial<Record<SocialPlatform, boolean>>>>({});
  const [isLoadingPromptSuggestion, setIsLoadingPromptSuggestion] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [rawAIResponse, setRawAIResponse] = useState<string | null>(null);
  const [suggestAIPrompt, setSuggestAIPrompt] = useState<string | null>(null);
  const [requestType, setRequestType] = useState<string | null>(null);

  const [pendingRequests, setPendingRequests] = useState<Record<string, { resolve: (value: any) => void, reject: (reason?: any) => void, onChunk?: (chunk: string) => void}>>({});
  const [isLoadingChatMessage, setIsLoadingChatMessage] = useState(false);
  // ++ IMPROVEMENT: Centralized AI response cleaning function
  const cleanAIResponseString = (rawText: string): string => {
    // This function removes common conversational filler, model-specific tokens, and markdown artifacts.
    return String(rawText)
      .replace(/<End-of-Turn>/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gs, '') // Remove "chain of thought" blocks
      .replace(/^(here's your suggestion:|here's the adapted text:|adapted text for \w+:|suggested prompt:|certainly, here is the suggestion:|here's a prompt:)\s*/im, '')
      .replace(/```(?:\w+\n)?([\s\S]+)```/, '$1') // Extract content from markdown code blocks
      .replace(/["'*`_~]/g, '') // Remove common markdown characters that aren't part of the content
      .trim();
  };


  useEffect(() => {
    const blob = new Blob([captionWorkerScript], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const newWorker = new Worker(url, { type: 'module' });
    setWorker(newWorker);

    newWorker.onmessage = (event: MessageEvent<any>) => {
      const { type, payload } = event.data as { type: string; payload: any };
      switch (type) {
        case 'progress':
          setModelProgress(payload.text);
          break;
        case 'init-done':
          setModelLoaded(true);
          setModelProgress(payload);
          setIsLoadingInitialItems(false);
          break;
        case 'text-result':
          {
            const { result, requestType, originalItemId, targetPlatform, originalTitle } = payload as TextResultPayload;

            // Store the raw response for debugging if needed, then process it.
            if (requestType === 'suggestPrompt') {
              setSuggestAIPrompt(result);
            } else {
              setRawAIResponse(result);
            }
            setRequestType(requestType);

            let requestId = '';
            if (requestType === 'initialCanvasItems') {
              requestId = 'initialCanvasItems';
            } else if (requestType === 'adaptCanvasItem' && originalItemId && targetPlatform) {
              requestId = `adapt-${originalItemId}-${targetPlatform}`;
            } else if (requestType === 'suggestPrompt' && originalTitle) {
              requestId = `suggestPrompt-${originalTitle}`;
            }

            if (requestId && pendingRequests[requestId]) {
              // The `resolve` function for each request type will handle its own specific parsing and cleaning.
              pendingRequests[requestId].resolve(result);
              setPendingRequests(prev => {
                const updatedRequests = { ...prev };
                delete updatedRequests[requestId];
                return updatedRequests;
              });
            }

            // Update loading states
            if (requestType === 'initialCanvasItems') setIsLoadingInitialItems(false);
            else if (requestType === 'adaptCanvasItem' && originalItemId && targetPlatform) {
              setIsLoadingAdaptation(prev => ({
                ...prev,
                [originalItemId]: { ...prev[originalItemId], [targetPlatform]: false }
              }));
            } else if (requestType === 'suggestPrompt') setIsLoadingPromptSuggestion(false);
          }
          break;

        case 'chat-chunk':
          {
            const { chunk, requestId } = payload;
            const request = pendingRequests[requestId];
            if (request && request.onChunk) {
              request.onChunk(chunk); // Call the specific onChunk callback for this request
            }
          }
          break;

        case 'chat-complete':
          {
            const { fullResponse, requestId } = payload;
            console.log();
            
            const request = pendingRequests[requestId];
            if (request) {
              request.resolve(fullResponse); // Resolve the promise with the final text
              setPendingRequests(prev => {
                const updated = { ...prev };
                delete updated[requestId];
                return updated;
              });
            }
            setIsLoadingChatMessage(false); // Stop loading indicator
          }
          break;

        case 'error':
          {
            const errorMessage = typeof payload === 'string' ? payload : 'An unknown error occurred in the AI worker.';
            setError(errorMessage);
            setRawAIResponse(`AI Worker Error:\n${errorMessage}`);

            // Reject all pending requests on critical error
            Object.values(pendingRequests).forEach(p => p.reject(new Error(errorMessage)));
            setPendingRequests({});

            // Reset all loading states
            setIsLoadingInitialItems(false);
            setIsLoadingAdaptation({});
            setIsLoadingPromptSuggestion(false);
            setModelProgress('Error encountered.');
          }
          break;
      }
    };

    setIsLoadingInitialItems(true);
    setModelProgress('Initializing AI model...');
    newWorker.postMessage({ type: 'init', payload: { model: WEBLLM_SELECTED_MODEL } });

    return () => {
      newWorker.terminate();
      URL.revokeObjectURL(url);
    };
  }, []); // Empty dependency array is correct, this effect should only run once.

  const generateInitialCanvasItems = useCallback((props: GenerateInitialCanvasItemsProps): Promise<string[]> => {
    return new Promise<string[]>((resolve, reject) => {
      if (!worker || !modelLoaded) {
        const err = "AI Model is not ready.";
        setError(err);
        return reject(new Error(err));
      }
      if (!props.customPrompt && !props.textFileContent) {
        const err = "Please provide some input for idea generation.";
        setError(err);
        return reject(new Error(err));
      }

      setIsLoadingInitialItems(true);
      setError(null);

      setPendingRequests(prev => ({ ...prev, initialCanvasItems: {
        resolve: (rawText: string) => {
          const startIndex = rawText.indexOf('[');
          const endIndex = rawText.lastIndexOf(']');
          if (startIndex === -1 || endIndex === -1) {
            console.warn("AI did not return a valid JSON array. The response was:", rawText);
            // Fallback: If no JSON, try splitting by newline as a last resort, but rejection is safer.
            return reject(new Error("AI response was not in the expected JSON format."));
          }
          const jsonString = rawText.substring(startIndex, endIndex + 1);
          try {
            let parsedItemTexts: string[] = JSON.parse(jsonString);
            if (Array.isArray(parsedItemTexts) && parsedItemTexts.every(item => typeof item === 'string')) {
              resolve(parsedItemTexts.slice(0, props.numberOfIdeas));
            } else {
              reject(new Error("Parsed JSON is not an array of strings."));
            }
          } catch (e) {
            console.error("Failed to parse AI response as JSON:", jsonString);
            reject(new Error("Failed to parse AI JSON response."));
          }
        },
        reject
      }}));

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

      worker.postMessage({ type: 'generate-text', payload: { prompt, requestType: 'initialCanvasItems' } });
    });
  }, [worker, modelLoaded]);

  const adaptCanvasItem = useCallback((props: AdaptCanvasItemProps): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!worker || !modelLoaded) {
            const err = "AI Model is not ready for adaptation.";
            setError(err);
            return reject(new Error(err));
        }

        setIsLoadingAdaptation(prev => ({
            ...prev,
            [props.itemId]: { ...prev[props.itemId], [props.targetPlatform]: true }
        }));
        setError(null);

        const requestId = `adapt-${props.itemId}-${props.targetPlatform}`;
        setPendingRequests(prev => ({ ...prev, [requestId]: {
          resolve: (rawText: string) => {
              // Use the centralized cleaner function
              resolve(cleanAIResponseString(rawText));
          },
          reject
        }}));

        const prompt = `Adapt the following social media text specifically for the ${props.targetPlatform} platform.
        Original Idea Text: "${props.originalText}"
        Original Tone for context: ${props.baseTone}
        Key Message/Topic from original prompt: ${props.customPrompt || 'General content based on original text.'}

        Platform-specific Instructions:
        - For X (formerly Twitter): Be concise and punchy (under 280 chars). Use 1-3 highly relevant hashtags.
        - For LinkedIn: Adopt a professional tone (200-500 words). Include a call-to-action or a thought-provoking question. Use professional hashtags.
        - For Instagram: Write a strong visual hook. Use 5-10 relevant hashtags and emojis where appropriate.
        - For Facebook: Write 1-3 engaging paragraphs. Encourage comments by asking questions.
        - For TikTok: Write a very short, catchy description (under 150 chars) with trending/relevant hashtags.

        IMPORTANT: Your output must ONLY be the adapted text itself. Do not add any conversational lead-in, explanation, or markdown formatting.
        `;

        worker.postMessage({
            type: 'generate-text',
            payload: {
                prompt,
                requestType: 'adaptCanvasItem',
                originalItemId: props.itemId,
                targetPlatform: props.targetPlatform
            }
        });
    });
  }, [worker, modelLoaded]);

  const suggestPromptForCanvasTitle = useCallback((title: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!worker || !modelLoaded) {
        const err = "AI Model is not ready for prompt suggestion.";
        setError(err);
        return reject(new Error(err));
      }
      if (!title.trim()) {
        const err = "Canvas title is required to suggest a prompt.";
        setError(err);
        return reject(new Error(err));
      }

      setIsLoadingPromptSuggestion(true);
      setError(null);

      const requestId = `suggestPrompt-${title}`;
      setPendingRequests(prev => ({ ...prev, [requestId]: {
        resolve: (rawText: string) => {
            // Use the centralized cleaner function
            resolve(cleanAIResponseString(rawText));
        },
        reject
      }}));

    // -- FIX: This is the heavily revised prompt --
    const promptToAI = `
    You are an expert Marketing Prompt Engineer. Your task is to write a detailed and effective prompt for another AI to use.
    This AI's goal is to generate a creative social media posts.

    The overall topic is: "${title}"

    The prompt you write MUST guide the other AI. It should contain instructions on what to focus on, the desired tone, and the kind of output needed.

    CRITICAL INSTRUCTIONS:
    1.  DO NOT write the final social media captions or ideas yourself.
    2.  Your output MUST BE the prompt for the other AI.
    3.  Do not include any explanation, conversational filler, or markdown formatting in your response.

    EXAMPLE:
    If the input topic was "Our New Sustainable Coffee Blend", a good output from you would be:
    "Generate distinct social media angles for our new sustainable coffee blend. Focus on the eco-friendly sourcing, the rich taste profile, and how it enhances the morning ritual. Use a warm, inviting tone. Include relevant hashtags."

    Now, based on the topic "${title}", write the new prompt.
    `;

    worker.postMessage({ type: 'generate-text', payload: { prompt: promptToAI, requestType: 'suggestPrompt', originalTitle: title } });
    });
  }, [worker, modelLoaded]);

  const generateChatResponse = useCallback((props: GenerateChatResponseProps): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      if (!worker || !modelLoaded) {
        const err = "AI Model is not ready for chat.";
        setError(err);
        return reject(new Error(err));
      }

      setIsLoadingChatMessage(true);
      setError(null);

      const requestId = `chat-${Date.now()}`;
      
      // Store the promise handlers and the onChunk callback
      setPendingRequests(prev => ({ 
          ...prev, 
          [requestId]: { resolve, reject, onChunk: props.onChunk }
      }));
      
      // Construct the full message history to send to the worker
      const messagesForEngine = [
        { role: 'system', content: CHATBOT_SYSTEM_INSTRUCTION },
        ...props.history,
        { role: 'user', content: props.userMessage }
      ];
      worker.postMessage({
          type: 'generate-chat', // Use the new, dedicated command
          payload: {
              messages: messagesForEngine,
              requestId
          }
      });
    });
  }, [worker, modelLoaded]);

  return {
    modelLoaded,
    modelProgress,
    isLoadingInitialItems,
    isLoadingAdaptation,
    isLoadingPromptSuggestion,
    isLoadingChatMessage,
    error,
    rawAIResponse, // Still useful for debugging
    suggestAIPrompt, // Still useful for debugging
    requestType, // Still useful for debugging
    generateInitialCanvasItems,
    adaptCanvasItem,
    suggestPromptForCanvasTitle,
    setError,
    generateChatResponse, // Included
  };
};

export default useWebLLM;