
import { FacebookSettings } from '../types';

const FB_SETTINGS_KEY = 'facebookSettings';

export const getFacebookSettings = (): FacebookSettings => {
  const storedSettings = localStorage.getItem(FB_SETTINGS_KEY);
  return storedSettings ? JSON.parse(storedSettings) : { sdkUrl: '', pageId: '' };
};

export const saveFacebookSettings = (settings: FacebookSettings): void => {
  localStorage.setItem(FB_SETTINGS_KEY, JSON.stringify(settings));
};
    