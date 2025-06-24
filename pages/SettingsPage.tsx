
import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { FacebookSettings, User, Theme } from '../types'; 
import { getFacebookSettings, saveFacebookSettings } from '../services/settingsService';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const SettingsPage: React.FC = () => {
  const { theme, setThemeExplicitly } = useTheme();
  const { currentUser, updateUserProfile, updateUserPassword } = useAuth();

  // Facebook Settings
  const [fbSettings, setFbSettings] = useState<FacebookSettings>(getFacebookSettings()); // Initialize with current settings
  const [fbNotification, setFbNotification] = useState<string | null>(null);

  // Personalization Settings
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(currentUser?.profilePictureUrl || null);
  const [username, setUsername] = useState(currentUser?.username || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [personalizationNotification, setPersonalizationNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // AI Model Cache Settings
  const [cachedModels, setCachedModels] = useState<string[]>([]);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheNotification, setCacheNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);

  useEffect(() => {
    // fbSettings are already initialized with getFacebookSettings()
    // No need to call it again here unless currentUser.role changes visibility logic not state.
    setUsername(currentUser?.username || '');
    setProfilePicturePreview(currentUser?.profilePictureUrl || null);
  }, [currentUser]);

  const fetchCachedModels = useCallback(async () => {
    setCacheLoading(true);
    setCacheNotification(null);
    try {
      if (!window.caches) {
        setCacheNotification({ type: 'error', message: 'Cache API is not available in this browser.' });
        setCachedModels([]);
        return;
      }
      const keys = await window.caches.keys();
      const webLlmCacheKeys = keys.filter(key =>
        key.toLowerCase().includes('mlc') ||
        key.toLowerCase().includes('web-llm-model') ||
        key.toLowerCase().includes('llm-chat')
      );
      setCachedModels(webLlmCacheKeys);
      if (webLlmCacheKeys.length === 0 && !cacheLoading) { 
         // setCacheNotification({ type: 'info', message: 'No WebLLM related models found in cache.' });
      }
    } catch (err) {
      console.error("Error fetching cached models:", err);
      setCacheNotification({ type: 'error', message: 'Failed to fetch cached models.' });
      setCachedModels([]);
    } finally {
      setCacheLoading(false);
    }
  }, []); 

  useEffect(() => {
    fetchCachedModels();
  }, [fetchCachedModels]);

  const handleRemoveCachedModel = useCallback(async (cacheName: string) => {
    setCacheLoading(true);
    setCacheNotification(null);
    try {
      if (!window.caches) {
        setCacheNotification({ type: 'error', message: 'Cache API is not available in this browser.' });
        return;
      }
      const success = await window.caches.delete(cacheName);
      if (success) {
        setCacheNotification({ type: 'success', message: `Cache "${cacheName}" removed successfully.` });
        await fetchCachedModels(); 
      } else {
        setCacheNotification({ type: 'info', message: `Cache "${cacheName}" was not found or already removed.` });
        await fetchCachedModels(); 
      }
    } catch (err) {
      console.error(`Error removing cache "${cacheName}":`, err);
      setCacheNotification({ type: 'error', message: `Failed to remove cache "${cacheName}".` });
    } finally {
      setCacheLoading(false);
    }
  }, [fetchCachedModels]);


  // Use the same type as Input component expects
  // import InputOrTextareaChangeEvent from '../components/ui/Input';

  const handleFbSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFbSettings({ ...fbSettings, [e.target.name]: e.target.value });
  };

  const handleSaveFbSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveFacebookSettings(fbSettings);
    setFbNotification('Facebook settings saved successfully!');
    setTimeout(() => setFbNotification(null), 3000);
  };

  const handleThemeChange = (selectedTheme: Theme) => {
    setThemeExplicitly(selectedTheme);
    setPersonalizationNotification({ type: 'success', message: `Theme changed to ${selectedTheme} mode.`});
    setTimeout(() => setPersonalizationNotification(null), 3000);
  };

  // Accept ChangeEvent<HTMLInputElement | HTMLTextAreaElement> for compatibility with Input component
  const handleProfilePictureChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    // Only handle file input
    if (event.target instanceof HTMLInputElement && event.target.type === "file") {
      const file = event.target.files?.[0];
      if (file) {
        setProfilePictureFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setProfilePicturePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setProfilePictureFile(null);
        setProfilePicturePreview(currentUser?.profilePictureUrl || null);
      }
    }
  };


  const handlePersonalizationSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsUpdatingProfile(true);
    setPersonalizationNotification(null);

    let profileUpdates: Partial<Pick<User, 'username' | 'profilePictureUrl'>> = {};
    let passwordUpdated = false;
    let profileUpdated = false;

    if (username !== currentUser.username) {
      profileUpdates.username = username;
    }

    if (profilePicturePreview && profilePicturePreview !== currentUser.profilePictureUrl) {
        profileUpdates.profilePictureUrl = profilePicturePreview;
    }
    
    if (Object.keys(profileUpdates).length > 0) {
        const result = await updateUserProfile(currentUser.id, profileUpdates);
        if (result.success) {
            profileUpdated = true;
        } else {
            setPersonalizationNotification({ type: 'error', message: result.message || 'Failed to update profile details.' });
            setIsUpdatingProfile(false);
            return;
        }
    }

    if (newPassword) {
      if (newPassword !== confirmPassword) {
        setPersonalizationNotification({ type: 'error', message: 'New passwords do not match.' });
        setIsUpdatingProfile(false);
        return;
      }
      const passResult = await updateUserPassword(currentUser.id, newPassword);
       if (passResult.success) {
            passwordUpdated = true;
            setNewPassword('');
            setConfirmPassword('');
        } else {
            setPersonalizationNotification({ type: 'error', message: passResult.message || 'Failed to update password.' });
            setIsUpdatingProfile(false);
            return;
        }
    }
    
    let message = '';
    if (profileUpdated && passwordUpdated) message = 'Profile details and password updated!';
    else if (profileUpdated) message = 'Profile details updated!';
    else if (passwordUpdated) message = 'Password updated!';
    
    if (message) {
        setPersonalizationNotification({ type: 'success', message });
    } else {
        setPersonalizationNotification({ type: 'info', message: 'No changes were made to your profile.'});
    }

    setTimeout(() => setPersonalizationNotification(null), 5000);
    setIsUpdatingProfile(false);
  };


  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-100">Settings</h1>
      
      {fbNotification && <Alert type="success" message={fbNotification} onClose={() => setFbNotification(null)} className="mb-4"/>}
      {personalizationNotification && <Alert type={personalizationNotification.type} message={personalizationNotification.message} onClose={() => setPersonalizationNotification(null)} className="mb-4"/>}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <Card title="Personalize Your Account" className="lg:col-span-1">
          <form onSubmit={handlePersonalizationSave} className="space-y-6">
            <div>
              <label htmlFor="profilePicture" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Profile Picture
              </label>
              <div className="mt-1 flex items-center space-x-4">
                <span className="inline-block h-20 w-20 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
                  {profilePicturePreview ? (
                    <img className="h-full w-full object-cover" src={profilePicturePreview} alt="Profile preview" />
                  ) : (
                    <svg className="h-full w-full text-slate-400 dark:text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  )}
                </span>
                <Input
                    id="profilePicture"
                    name="profilePicture"
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePictureChange}
                    className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-700 dark:file:text-primary-50 dark:hover:file:bg-primary-600"
                    wrapperClassName="mb-0"
                />
              </div>
            </div>

            <Input
              label="Username"
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              required
            />
            <Input
              label="New Password (optional)"
              id="newPassword"
              name="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
            />
            <Input
              label="Confirm New Password"
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              disabled={!newPassword}
            />
            <Button type="submit" variant="primary" isLoading={isUpdatingProfile}>
              {isUpdatingProfile ? 'Saving...' : 'Save Personalization'}
            </Button>
          </form>
        </Card>

        <Card title="Appearance" className="lg:col-span-1">
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">Choose your preferred theme:</p>
            <div className="flex space-x-3">
              <Button 
                onClick={() => handleThemeChange('light')} 
                variant={theme === 'light' ? 'primary' : 'secondary'}
                icon={<i className="fas fa-sun"></i>}
              >
                Light Mode
              </Button>
              <Button 
                onClick={() => handleThemeChange('dark')} 
                variant={theme === 'dark' ? 'primary' : 'secondary'}
                icon={<i className="fas fa-moon"></i>}
              >
                Dark Mode
              </Button>
            </div>
          </div>
        </Card>

        {currentUser?.role === UserRole.ADMIN && (
          <Card title="Facebook Integration" className="lg:col-span-2">
            <form onSubmit={handleSaveFbSettings} className="space-y-4">
              <Input
                label="Facebook SDK URL"
                id="sdkUrl"
                name="sdkUrl"
                type="text"
                value={fbSettings.sdkUrl}
                onChange={handleFbSettingsChange}
                placeholder="e.g., https://connect.facebook.net/en_US/sdk.js"
                disabled // SDK URL is not meant to be frequently changed by admin
                title="This URL is typically fixed. Contact support if changes are needed."
              />
               <Input
                label="Facebook App ID"
                id="appId"
                name="appId"
                type="text"
                value={fbSettings.appId}
                onChange={handleFbSettingsChange}
                placeholder="Your Facebook App ID (for SDK)"
                required
              />
              <Input
                label="Facebook Page ID (for Analytics)"
                id="pageId"
                name="pageId"
                type="text"
                value={fbSettings.pageId}
                onChange={handleFbSettingsChange}
                placeholder="Your Facebook Page ID"
                required
              />
              <Button type="submit" variant="primary">Save Facebook Settings</Button>
            </form>
             <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                The App ID and Page ID are required for fetching Facebook analytics.
                The SDK URL is generally fixed and used to load Facebook's JavaScript SDK.
             </p>
          </Card>
        )}

        <Card title="Manage AI Models Cache" className="lg:col-span-2">
          {cacheNotification && <Alert type={cacheNotification.type} message={cacheNotification.message} onClose={() => setCacheNotification(null)} className="mb-4"/>}
          <div className="my-4 flex items-center space-x-3">
            <Button onClick={fetchCachedModels} variant="secondary" size="sm" isLoading={cacheLoading && !cachedModels.length} disabled={cacheLoading}>
              <i className="fas fa-sync-alt mr-2"></i> Refresh List
            </Button>
            {cacheLoading && cachedModels.length > 0 && <LoadingSpinner size="sm" />}
          </div>
          
          {cacheLoading && cachedModels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6">
              <LoadingSpinner size="md" />
              <p className="mt-3 text-slate-500 dark:text-slate-400">Loading cached models...</p>
            </div>
          ) : !cacheLoading && cachedModels.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 py-4 text-center">
              No WebLLM related models found in browser cache.
              Models are cached automatically when you use AI features for the first time.
            </p>
          ) : (
            <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {cachedModels.map(modelName => (
                <li key={modelName} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg shadow-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <span className="text-sm text-slate-700 dark:text-slate-300 truncate mr-4 flex-grow" title={modelName}>{modelName}</span>
                  <Button
                    onClick={() => handleRemoveCachedModel(modelName)}
                    variant="danger"
                    size="sm"
                    isLoading={cacheLoading} 
                    disabled={cacheLoading}
                    aria-label={`Remove ${modelName} from cache`}
                    className="flex-shrink-0"
                  >
                    <i className="fas fa-trash-alt sm:mr-1"></i>
                    <span className="hidden sm:inline">Remove</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

      </div>
    </div>
  );
};

export default SettingsPage;
