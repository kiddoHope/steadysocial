import { FacebookSettings } from '../types';

const FB_SETTINGS_KEY = 'facebookSettings';
const DEFAULT_FB_SDK_URL = 'https://connect.facebook.net/en_US/sdk.js';
const DEFAULT_MESSAGING_APP_ID = '1084086590308098'; // Default messaging App ID

export const getFacebookSettings = (): FacebookSettings => {
  const storedSettings = localStorage.getItem(FB_SETTINGS_KEY);
  const defaults: FacebookSettings = { 
    sdkUrl: DEFAULT_FB_SDK_URL, 
    appId: '', 
    pageId: '', 
    messagingAppId: DEFAULT_MESSAGING_APP_ID
  };
  if (storedSettings) {
    const parsed = JSON.parse(storedSettings);
    // Ensure all keys are present, merging with defaults
    // If messagingAppId is not in storedSettings or is null/undefined, the default from `defaults` will be used.
    return { 
      ...defaults, 
      ...parsed,
      // Explicitly apply default for messagingAppId if parsed value is null or undefined
      messagingAppId: parsed.messagingAppId !== undefined && parsed.messagingAppId !== null ? parsed.messagingAppId : DEFAULT_MESSAGING_APP_ID,
    };
  }
  return defaults;
};

export const saveFacebookSettings = (settings: Partial<FacebookSettings>): void => {
  // Merge with existing settings to only update provided fields
  const currentSettings = getFacebookSettings();
  const newSettings = { ...currentSettings, ...settings };
  localStorage.setItem(FB_SETTINGS_KEY, JSON.stringify(newSettings));
};