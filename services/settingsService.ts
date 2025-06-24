
import { FacebookSettings } from '../types';

const FB_SETTINGS_KEY = 'facebookSettings';
const DEFAULT_FB_SDK_URL = 'https://connect.facebook.net/en_US/sdk.js';

export const getFacebookSettings = (): FacebookSettings => {
  const storedSettings = localStorage.getItem(FB_SETTINGS_KEY);
  const defaults: FacebookSettings = { 
    sdkUrl: DEFAULT_FB_SDK_URL, 
    pageId: '', 
    appId: '' 
  };
  if (storedSettings) {
    const parsed = JSON.parse(storedSettings);
    // Ensure all keys are present, merging with defaults
    return { ...defaults, ...parsed };
  }
  return defaults;
};

export const saveFacebookSettings = (settings: FacebookSettings): void => {
  localStorage.setItem(FB_SETTINGS_KEY, JSON.stringify(settings));
};
