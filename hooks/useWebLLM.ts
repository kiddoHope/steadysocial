import { useState, useEffect, useCallback } from 'react';
import { SocialPlatform, CaptionTone, AISettings, AIProvider } from '../types';
import {
  DEFAULT_LOCAL_LLM_ENDPOINT,
  DEFAULT_LOCAL_LLM_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../constants';
import { dbGetAISettings } from '../services/settingsService';

const CHATBOT_SYSTEM_INSTRUCTION =
  "You are SteadySocial AI, a friendly and expert social media copywriter. When asked for content, provide a few distinct options with relevant hashtags and emojis. Give clear, actionable advice when asked. Format responses with markdown. Do not use `<End-of-Turn>` or `<think>` tags.";

interface GenerateInitialCanvasItemsProps {
  customPrompt: string;
  textFileContent: string | null;
  imageDataUrl: string | null;
  platform: SocialPlatform;
  tone: CaptionTone;
  numberOfIdeas: number;
}

interface GenerateChatResponseProps {
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk: (chunk: string) => void;
}

interface GenerateComfyUIPromptProps {
  customPrompt: string;
  textFileContent: string | null;
  referenceImages: string[]; // data URLs
  tone: CaptionTone;
}

interface GenerateCaptionsForImagesProps {
  images: string[]; // data URLs
  customPrompt: string;
  platform: SocialPlatform;
  tone: CaptionTone;
  count?: number;
}

interface AdaptCanvasItemProps {
  itemId: string;
  originalText: string;
  targetPlatform: SocialPlatform;
  baseTone: CaptionTone;
  customPrompt: string;
  textFileContent: string | null;
}

interface ParsedImageData {
  mimeType: string;
  rawBase64: string;
  dataUrl: string;
}

const useWebLLM = () => {
  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    const saved = localStorage.getItem('ai_settings');

    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse AI settings', e);
      }
    }

    return {
      provider: (localStorage.getItem('ai_provider') as AIProvider) || AIProvider.LOCAL,
      local: {
        endpoint: localStorage.getItem('local_llm_endpoint') || DEFAULT_LOCAL_LLM_ENDPOINT,
        model: localStorage.getItem('local_llm_model') || DEFAULT_LOCAL_LLM_MODEL,
      },
      cloud: {
        apiKey: localStorage.getItem('cloud_api_key') || '',
        model: localStorage.getItem('cloud_ai_model') || DEFAULT_GEMINI_MODEL,
      },
    };
  });

  const [creativeModelLoaded, setCreativeModelLoaded] = useState(false);
  const [creativeModelProgress, setCreativeModelProgress] = useState('Initializing AI...');
  const [chatbotModelLoaded, setChatbotModelLoaded] = useState(false);
  const [chatbotModelProgress, setChatbotModelProgress] = useState('Initializing AI...');

  const [isLoadingInitialItems, setIsLoadingInitialItems] = useState(false);
  const [isLoadingAdaptation, setIsLoadingAdaptation] = useState<
    Record<string, Partial<Record<SocialPlatform, boolean>>>
  >({});
  const [isLoadingPromptSuggestion, setIsLoadingPromptSuggestion] = useState(false);
  const [isLoadingChatMessage, setIsLoadingChatMessage] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [rawAIResponse, setRawAIResponse] = useState<string | null>(null);
  const [suggestAIPrompt, setSuggestAIPrompt] = useState<string | null>(null);
  const [requestType, setRequestType] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    const loadBackendSettings = async () => {
      try {
        const backendSettings = await dbGetAISettings();

        if (backendSettings && backendSettings.provider) {
          setAiSettings(prev => ({
            ...prev,
            ...backendSettings,
            local: {
              ...prev.local,
              ...(backendSettings.local || {}),
            },
            cloud: {
              ...prev.cloud,
              ...(backendSettings.cloud || {}),
            },
          }));
        }
      } catch (err) {
        console.error('Failed to load AI settings from backend', err);
      }
    };

    loadBackendSettings();
  }, []);

  /**
   * Accepts either:
   * - data:image/png;base64,xxxxx
   * - raw base64 string
   */
  const parseImageDataUrl = (imageDataUrl: string): ParsedImageData => {
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

    if (match) {
      return {
        mimeType: match[1],
        rawBase64: match[2],
        dataUrl: imageDataUrl,
      };
    }

    return {
      mimeType: 'image/png',
      rawBase64: imageDataUrl,
      dataUrl: `data:image/png;base64,${imageDataUrl}`,
    };
  };

  /**
   * LM Studio local vision:
   * - For your setup, we send RAW BASE64 only.
   *
   * OpenAI cloud vision:
   * - Send full data URL.
   *
   * Gemini:
   * - We convert this later into inline_data.
   */
  const buildVisionContent = (
    text: string,
    imageDataUrl?: string | null,
    target: 'local' | 'openai' = 'local'
  ) => {
    if (!imageDataUrl) {
      return text;
    }

    const image = parseImageDataUrl(imageDataUrl);

    return [
      {
        type: 'text',
        text,
      },
      {
        type: 'image_url',
        image_url: {
          // LM Studio expects this field to be a valid URL-like string.
          // A data URL is valid. Raw base64 alone can trigger: { error: 'Invalid url.' }
          url: image.dataUrl,
        },
      },
    ];
  };

  const buildContentForCurrentProvider = (text: string, imageDataUrl?: string | null) => {
    if (!imageDataUrl) {
      return text;
    }

    if (aiSettings.provider === AIProvider.LOCAL) {
      return buildVisionContent(text, imageDataUrl, 'local');
    }

    if (aiSettings.provider === AIProvider.OPENAI) {
      return buildVisionContent(text, imageDataUrl, 'openai');
    }

    if (aiSettings.provider === AIProvider.GEMINI) {
      return buildVisionContent(text, imageDataUrl, 'openai');
    }

    return text;
  };

  const buildGeminiParts = (content: any): any[] => {
    if (!Array.isArray(content)) {
      return [{ text: String(content) }];
    }

    return content.map((part: any) => {
      if (part.type === 'text') {
        return { text: part.text };
      }

      if (part.type === 'image_url') {
        const image = parseImageDataUrl(part.image_url.url);

        return {
          inline_data: {
            mime_type: image.mimeType,
            data: image.rawBase64,
          },
        };
      }

      return { text: '' };
    });
  };

  /**
   * Only extracts the user-visible assistant answer.
   * Ignores reasoning_content from reasoning models.
   */
  const extractAssistantContent = (data: any): string => {
    const message = data?.choices?.[0]?.message;

    if (!message) {
      return '';
    }

    if (typeof message.content === 'string') {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .map((part: any) => {
          if (typeof part === 'string') return part;
          if (part?.type === 'text') return part.text || '';
          return '';
        })
        .join('')
        .trim();
    }

    return '';
  };

  const cleanAIResponseString = (rawText: string): string => {
    return String(rawText)
      .replace(/<End-of-Turn>/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(
        /^(here's your suggestion:|here's the adapted text:|adapted text for \w+:|suggested prompt:|certainly, here is the suggestion:|here's a prompt:)\s*/im,
        ''
      )
      .replace(/```(?:\w+\n)?([\s\S]+)```/, '$1')
      .replace(/["'*`_~]/g, '')
      .trim();
  };

  const checkLLMStatus = useCallback(async () => {
    if (aiSettings.provider !== AIProvider.LOCAL) {
      setCreativeModelLoaded(true);
      setCreativeModelProgress(`${aiSettings.provider.toUpperCase()} AI Ready`);
      setChatbotModelLoaded(true);
      setChatbotModelProgress(`${aiSettings.provider.toUpperCase()} AI Ready`);
      return;
    }

    try {
      setError(null);

      const response = await fetch(`${aiSettings.local.endpoint}/models`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Endpoint reached but returned error status.');
      }

      const data = await response.json();

      if (data && data.data && Array.isArray(data.data)) {
        setAvailableModels(data.data.map((m: any) => m.id));
      }

      setCreativeModelLoaded(true);
      setCreativeModelProgress('Local LLM Connected');
      setChatbotModelLoaded(true);
      setChatbotModelProgress('Local LLM Connected');
    } catch (err) {
      setCreativeModelLoaded(false);
      setCreativeModelProgress('Local LLM Offline');
      setChatbotModelLoaded(false);
      setChatbotModelProgress('Local LLM Offline');
      setError('Could not connect to local LLM. Ensure LM Studio is running and the local server is enabled.');
    }
  }, [aiSettings.provider, aiSettings.local.endpoint]);

  useEffect(() => {
    checkLLMStatus();
  }, [checkLLMStatus]);

  const callLocalLLM = async (
    messages: any[],
    stream = false,
    onChunk?: (chunk: string) => void
  ): Promise<string> => {
    const response = await fetch(`${aiSettings.local.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiSettings.local.model,
        messages,
        stream,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Local LM Studio error:', errorData);
      throw new Error(errorData.error?.message || 'Failed to call local LLM');
    }

    if (stream && onChunk) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (!reader) {
        return fullText;
      }

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmedLine = line.trim();

          if (!trimmedLine.startsWith('data: ')) continue;

          const dataStr = trimmedLine.slice(6);

          if (dataStr === '[DONE]') break;

          try {
            const data = JSON.parse(dataStr);
            const content = data.choices?.[0]?.delta?.content || '';

            if (content) {
              fullText += content;
              onChunk(content);
            }
          } catch (e) {
            console.error('Error parsing LM Studio stream chunk', e);
          }
        }
      }

      return fullText;
    }

    const data = await response.json();
    return extractAssistantContent(data);
  };

  const callCloudAI = async (
    messages: any[],
    stream = false,
    onChunk?: (chunk: string) => void
  ): Promise<string> => {
    const { provider, cloud } = aiSettings;

    if (provider === AIProvider.GEMINI) {
      if (!cloud.apiKey) {
        throw new Error('Gemini API key is missing.');
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${cloud.model}:generateContent?key=${cloud.apiKey}`;

      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: buildGeminiParts(m.content),
        }));

      const systemMessage = messages.find(m => m.role === 'system')?.content;

      const requestBody: any = {
        contents,
      };

      if (systemMessage) {
        requestBody.system_instruction = {
          parts: [{ text: String(systemMessage) }],
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Gemini API error:', errorData);
        throw new Error(errorData.error?.message || 'Gemini API Error');
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (stream && onChunk) {
        onChunk(text);
      }

      return text;
    }

    if (provider === AIProvider.OPENAI) {
      if (!cloud.apiKey) {
        throw new Error('OpenAI API key is missing.');
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cloud.apiKey}`,
        },
        body: JSON.stringify({
          model: cloud.model,
          messages,
          stream,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('OpenAI API error:', errorData);
        throw new Error(errorData.error?.message || 'OpenAI API Error');
      }

      if (stream && onChunk) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        if (!reader) {
          return fullText;
        }

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            const trimmedLine = line.trim();

            if (!trimmedLine.startsWith('data: ')) continue;

            const dataStr = trimmedLine.slice(6);

            if (dataStr === '[DONE]') break;

            try {
              const data = JSON.parse(dataStr);
              const content = data.choices?.[0]?.delta?.content || '';

              if (content) {
                fullText += content;
                onChunk(content);
              }
            } catch (e) {
              console.error('Error parsing OpenAI stream chunk', e);
            }
          }
        }

        return fullText;
      }

      const data = await response.json();
      return extractAssistantContent(data);
    }

    throw new Error('Unsupported cloud provider');
  };

  const callAI = async (
    messages: any[],
    stream = false,
    onChunk?: (chunk: string) => void
  ): Promise<string> => {
    if (aiSettings.provider === AIProvider.LOCAL) {
      return callLocalLLM(messages, stream, onChunk);
    }

    return callCloudAI(messages, stream, onChunk);
  };

  const parsePostsFromResult = (result: string, limit: number): string[] => {
    let posts: string[] = [];

    try {
      const jsonMatch = result.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (Array.isArray(parsed)) {
          posts = parsed
            .map(item => String(item))
            .filter(item => item.trim().length > 0);
        }
      }
    } catch (e) {
      console.warn('Failed to parse JSON array from AI response. Falling back to text parsing.', e);
    }

    if (posts.length === 0) {
      posts = result
        .split(/\n\s*\n|(?=\d+\.\s)/g)
        .map((p: string) => cleanAIResponseString(p))
        .filter((p: string) => p.length > 10);
    }

    return posts.slice(0, limit);
  };

  const generateInitialCanvasItems = useCallback(
    async (props: GenerateInitialCanvasItemsProps): Promise<string[]> => {
      setIsLoadingInitialItems(true);
      setError(null);

      try {
        const promptText = `Act as an expert social media copywriter.

Your task is to write exactly ${props.numberOfIdeas} distinct social media posts based on the provided details. The posts should be varied in structure, style, and length.

Platform Context: ${props.platform}
Desired Tone: ${props.tone}
Core Message/Prompt: ${props.customPrompt}
Additional details from text file: ${props.textFileContent || 'None'}
${props.imageDataUrl ? 'Image Context: An image is attached. Analyze the image carefully and use its visual content as context and inspiration for the posts.' : 'Image Context: None'}

IMPORTANT:
- Respond ONLY with a valid JSON array of strings.
- Each string must be one complete, ready-to-use social media post.
- Do not include explanations, headings, markdown fences, or extra commentary.`;

        const messageContent = buildContentForCurrentProvider(promptText, props.imageDataUrl);

        const result = await callAI([
          {
            role: 'user',
            content: messageContent,
          },
        ]);

        const posts = parsePostsFromResult(result, props.numberOfIdeas);

        setRawAIResponse(result);
        setRequestType('initialCanvasItems');

        return posts;
      } catch (err: any) {
        setError(err.message || 'Failed to generate initial canvas items.');
        throw err;
      } finally {
        setIsLoadingInitialItems(false);
      }
    },
    [aiSettings]
  );

  const adaptCanvasItem = useCallback(
    async (props: AdaptCanvasItemProps): Promise<string> => {
      setIsLoadingAdaptation(prev => ({
        ...prev,
        [props.itemId]: {
          ...prev[props.itemId],
          [props.targetPlatform]: true,
        },
      }));
      setError(null);

      try {
        const prompt = `Adapt the following social media text specifically for the ${props.targetPlatform} platform.

Original Idea Text: "${props.originalText}"
Original Tone for context: ${props.baseTone}
Key Message/Topic from original prompt: ${props.customPrompt || 'General content based on original text.'}

Platform-specific Instructions:
- For X / Twitter: concise, under 280 characters, with 1-3 relevant hashtags.
- For LinkedIn: professional tone, thoughtful structure, call-to-action or question, and professional hashtags.
- For Instagram: strong visual hook, engaging wording, emojis where appropriate, and 5-10 hashtags.
- For Facebook: 1-3 engaging paragraphs and encourage comments.
- For TikTok: short, catchy description under 150 characters with relevant hashtags.

IMPORTANT:
- Output ONLY the adapted text itself.
- No lead-in.
- No explanation.
- No markdown fences.
- No labels.`;

        const result = await callAI([
          {
            role: 'user',
            content: prompt,
          },
        ]);

        return cleanAIResponseString(result);
      } catch (err: any) {
        setError(err.message || 'Failed to adapt canvas item.');
        throw err;
      } finally {
        setIsLoadingAdaptation(prev => ({
          ...prev,
          [props.itemId]: {
            ...prev[props.itemId],
            [props.targetPlatform]: false,
          },
        }));
      }
    },
    [aiSettings]
  );

  const suggestPromptForCanvasTitle = useCallback(
    async (
      title: string,
      textFileContent?: string | null,
      imageDataUrl?: string | null
    ): Promise<string> => {
      setIsLoadingPromptSuggestion(true);
      setError(null);

      try {
        const promptText = `You are a prompt engineering expert.

Generate one strong mission prompt for social media content based strictly on the provided context.

Current Title: "${title}"
Document Context: ${textFileContent || 'None'}
${imageDataUrl ? 'Image Context: An image is attached. Analyze the image carefully and use its visual content as important context.' : 'Image Context: None'}

Requirements:
- The prompt must be a directive, for example: "Create content about..."
- It must be based only on the title, document, and attached image if present.
- Do not add external assumptions.
- Respond with only the final mission prompt text.`;

        const messageContent = buildContentForCurrentProvider(promptText, imageDataUrl);

        const result = await callAI([
          {
            role: 'user',
            content: messageContent,
          },
        ]);

        const cleaned = cleanAIResponseString(result);

        setSuggestAIPrompt(cleaned);
        setRequestType('suggestPrompt');

        return cleaned;
      } catch (err: any) {
        setError(err.message || 'Failed to suggest prompt.');
        throw err;
      } finally {
        setIsLoadingPromptSuggestion(false);
      }
    },
    [aiSettings]
  );

  const generateChatResponse = useCallback(
    async (props: GenerateChatResponseProps): Promise<string> => {
      setIsLoadingChatMessage(true);
      setError(null);

      try {
        const result = await callAI(
          [
            {
              role: 'system',
              content: CHATBOT_SYSTEM_INSTRUCTION,
            },
            ...props.history,
            {
              role: 'user',
              content: props.userMessage,
            },
          ],
          true,
          props.onChunk
        );

        return result;
      } catch (err: any) {
        setError(err.message || 'Failed to generate chat response.');
        throw err;
      } finally {
        setIsLoadingChatMessage(false);
      }
    },
    [aiSettings]
  );

  const generateComfyUIPrompt = useCallback(async (props: GenerateComfyUIPromptProps): Promise<string> => {
    setError(null);
    try {
      const promptText = `Act as a ComfyUI prompt engineering expert.
      
Generate a highly detailed and effective image generation prompt for Stable Diffusion / ComfyUI.
The prompt should be based on:
Mission/Goal: ${props.customPrompt}
Tone/Style: ${props.tone}
Context from Docs: ${props.textFileContent || 'None'}
Reference Images: ${props.referenceImages.length > 0 ? 'Analyzed from provided images.' : 'None provided.'}

Requirements:
- Use descriptive keywords, lighting, composition, and style modifiers.
- Output ONLY the final prompt string.
- No lead-in or explanation.`;

      // Use the first reference image for vision if available
      const messageContent = buildContentForCurrentProvider(promptText, props.referenceImages[0] || null);

      const result = await callAI([
        {
          role: 'user',
          content: messageContent,
        },
      ]);

      return cleanAIResponseString(result);
    } catch (err: any) {
      setError(err.message || 'Failed to generate ComfyUI prompt.');
      throw err;
    }
  }, [aiSettings]);

  const generateCaptionsForImages = useCallback(async (props: GenerateCaptionsForImagesProps): Promise<string[]> => {
    setIsLoadingInitialItems(true);
    setError(null);
    try {
      const results: string[] = [];
      const count = props.count || 1;
      
      for (const imageDataUrl of props.images) {
        for (let i = 0; i < count; i++) {
          const promptText = `Act as an expert social media copywriter.
          
Write a unique, compelling, and high-converting social media post for ${props.platform} based on the attached image.
This is option ${i + 1} of ${count}. It must be completely distinct from other options.
The post should reflect the tone "${props.tone}" and the mission goal "${props.customPrompt}".

IMPORTANT:
- Output ONLY the post text.
- No hashtags unless specifically requested in the mission.
- No labels or commentary.`;

          const messageContent = buildContentForCurrentProvider(promptText, imageDataUrl);

          const result = await callAI([
            {
              role: 'user',
              content: messageContent,
            },
          ]);

          results.push(cleanAIResponseString(result));
        }
      }

      return results;
    } catch (err: any) {
      setError(err.message || 'Failed to generate captions for images.');
      throw err;
    } finally {
      setIsLoadingInitialItems(false);
    }
  }, [aiSettings]);

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
    generateComfyUIPrompt,
    generateCaptionsForImages,
    setError,
    generateChatResponse,
    callAI,
    llmSettings: aiSettings,
    availableModels,
    setLlmSettings: (newSettings: AISettings) => {
      setAiSettings(newSettings);

      localStorage.setItem('ai_settings', JSON.stringify(newSettings));
      localStorage.setItem('ai_provider', newSettings.provider);
      localStorage.setItem('local_llm_endpoint', newSettings.local.endpoint);
      localStorage.setItem('local_llm_model', newSettings.local.model);
      localStorage.setItem('cloud_api_key', newSettings.cloud.apiKey);
      localStorage.setItem('cloud_ai_model', newSettings.cloud.model);
    },
  };
};

export default useWebLLM;