
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
export const WEBLLM_SELECTED_MODEL = "Llama-3-8B-Instruct-q4f16_1-MLC"; // Example if changing
// export const WEBLLM_SELECTED_MODEL = "SmolLM2-360M-Instruct-q0f16-MLC"; // Keeping user's current model
