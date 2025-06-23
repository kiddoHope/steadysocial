
import { SocialPlatform, CaptionTone } from './types';

export const APP_NAME = "SteadySocial";
export const APP_TAGLINE = "Your Consistent Path to Social Success.";

export const AVAILABLE_PLATFORMS: SocialPlatform[] = [
  SocialPlatform.General,
  SocialPlatform.Facebook,
  SocialPlatform.Instagram,
  SocialPlatform.X, // Primary
  SocialPlatform.LinkedIn,
  SocialPlatform.TikTok,
  SocialPlatform.Twitter, // Legacy, can be phased out
];

export const AVAILABLE_TONES: CaptionTone[] = [
  CaptionTone.Friendly,
  CaptionTone.Professional,
  CaptionTone.Witty,
  CaptionTone.Empathetic,
  CaptionTone.Urgent,
  CaptionTone.Playful,
  CaptionTone.Inspirational,
];

// Using a Llama3 model, which is generally better for creative generation
// export const WEBLLM_SELECTED_MODEL = "Llama-3-8B-Instruct-q4f16_1-MLC"; // Example if changing
export const WEBLLM_SELECTED_MODEL = "Mistral-7B-Instruct-v0.3-q4f32_1-MLC"; // Example if changing
// export const WEBLLM_SELECTED_MODEL = "DeepSeek-R1-Distill-Qwen-7B-q4f32_1-MLC"; // Model ID for WebLLM
// export const WEBLLM_SELECTED_MODEL = "Qwen3-8B-q4f32_1-MLC"; // Keeping user's current model
// export const WEBLLM_SELECTED_MODEL = "Phi-3.5-mini-instruct-q4f32_1-MLC"; // Keeping user's current model
// export const WEBLLM_SELECTED_MODEL = "SmolLM2-1.7B-Instruct-q4f16_1-MLC"; // Keeping user's current model
// export const WEBLLM_SELECTED_MODEL = "SmolLM2-360M-Instruct-q0f16-MLC"; // Keeping user's current model
// Model for creative content generation (e.g., on Content Canvas page)
export const WEBLLM_CREATIVE_MODEL = "Hermes-3-Llama-3.2-3B-q4f32_1-MLC"; 

// Model for chatbot interactions
export const WEBLLM_CHATBOT_MODEL = "stablelm-2-zephyr-1_6b-q4f16_1-MLC";
