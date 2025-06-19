
import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { FacebookSettings, User } from '../types'; // Added User import
import { getFacebookSettings, saveFacebookSettings } from '../services/settingsService';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';

const SettingsPage: React.FC = () => {
  const { theme, setThemeExplicitly } = useTheme();
  const { currentUser, updateUserProfile, updateUserPassword } = useAuth();

  // Facebook Settings
  const [fbSettings, setFbSettings] = useState<FacebookSettings>({ sdkUrl: '', pageId: '' });
  const [fbNotification, setFbNotification] = useState<string | null>(null);

  // Personalization Settings
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(currentUser?.profilePictureUrl || null);
  const [username, setUsername] = useState(currentUser?.username || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [personalizationNotification, setPersonalizationNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null); // Added 'info'
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useEffect(() => {
    if (currentUser?.role === UserRole.ADMIN) {
      setFbSettings(getFacebookSettings());
    }
    setUsername(currentUser?.username || '');
    setProfilePicturePreview(currentUser?.profilePictureUrl || null);
  }, [currentUser]);

  const handleFbSettingsChange = (event: { target: HTMLInputElement | HTMLTextAreaElement }) => {
    setFbSettings({ ...fbSettings, [event.target.name]: event.target.value });
  };

  const handleSaveFbSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveFacebookSettings(fbSettings);
    setFbNotification('Facebook settings saved successfully!');
    setTimeout(() => setFbNotification(null), 3000);
  };

  const handleThemeChange = (selectedTheme: 'light' | 'dark') => {
    setThemeExplicitly(selectedTheme);
    // Using personalizationNotification for theme change message for simplicity
    setPersonalizationNotification({ type: 'success', message: `Theme changed to ${selectedTheme} mode.`});
    setTimeout(() => setPersonalizationNotification(null), 3000);
  };

  const handleProfilePictureChange = (event: any) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      setProfilePictureFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setProfilePictureFile(null);
      setProfilePicturePreview(currentUser?.profilePictureUrl || null); // Revert to current or none
    }
  };

  const handlePersonalizationSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsUpdatingProfile(true);
    setPersonalizationNotification(null);

    let profileUpdates: Partial<Pick<User, 'username' | 'profilePictureUrl'>> = {};
    let passwordUpdated = false;

    // Update username if changed
    if (username !== currentUser.username) {
      profileUpdates.username = username;
    }

    // Update profile picture if a new one is previewed
    if (profilePicturePreview && profilePicturePreview !== currentUser.profilePictureUrl) {
        profileUpdates.profilePictureUrl = profilePicturePreview;
    }
    
    if (Object.keys(profileUpdates).length > 0) {
        const result = await updateUserProfile(currentUser.id, profileUpdates);
        if (result.success) {
            setPersonalizationNotification({ type: 'success', message: result.message || 'Profile details updated!' });
        } else {
            setPersonalizationNotification({ type: 'error', message: result.message || 'Failed to update profile details.' });
            setIsUpdatingProfile(false);
            return; // Stop if profile update failed (e.g. username taken)
        }
    }


    // Update password if new password is provided and confirmed
    if (newPassword) {
      if (newPassword !== confirmPassword) {
        setPersonalizationNotification({ type: 'error', message: 'New passwords do not match.' });
        setIsUpdatingProfile(false);
        return;
      }
      const passResult = await updateUserPassword(currentUser.id, newPassword);
       if (passResult.success) {
            // If profile also updated, append to message, else set new message.
            setPersonalizationNotification(prev => ({
                type: 'success',
                message: prev && Object.keys(profileUpdates).length > 0 ? (prev.message + " Password updated.") : (passResult.message || "Password updated!")
            }));
            setNewPassword('');
            setConfirmPassword('');
            passwordUpdated = true;
        } else {
            setPersonalizationNotification({ type: 'error', message: passResult.message || 'Failed to update password.' });
            setIsUpdatingProfile(false);
            return;
        }
    }
    
    if (!Object.keys(profileUpdates).length && !passwordUpdated) {
        setPersonalizationNotification({ type: 'info', message: 'No changes detected.'});
    }


    setTimeout(() => setPersonalizationNotification(null), 5000);
    setIsUpdatingProfile(false);
  };


  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-100">Settings</h1>
      
      {/* Notifications will appear here */}
      {fbNotification && <Alert type="success" message={fbNotification} onClose={() => setFbNotification(null)} className="mb-4"/>}
      {personalizationNotification && <Alert type={personalizationNotification.type} message={personalizationNotification.message} onClose={() => setPersonalizationNotification(null)} className="mb-4"/>}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Personalization Card - For All Users */}
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

        {/* Appearance Card - For All Users */}
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

        {/* Facebook Integration Card - Admin Only */}
        {currentUser?.role === UserRole.ADMIN && (
          <Card title="Facebook Integration" className="lg:col-span-2"> {/* Takes full width if it's the only one in a row or spans across */}
            <form onSubmit={handleSaveFbSettings} className="space-y-4">
              <Input
                label="Facebook SDK URL"
                id="sdkUrl"
                name="sdkUrl"
                type="text"
                value={fbSettings.sdkUrl}
                onChange={handleFbSettingsChange}
                placeholder="e.g., https://connect.facebook.net/en_US/sdk.js"
              />
              <Input
                label="Facebook Page ID"
                id="pageId"
                name="pageId"
                type="text"
                value={fbSettings.pageId}
                onChange={handleFbSettingsChange}
                placeholder="Your Facebook Page ID"
              />
              <Button type="submit" variant="primary">Save Facebook Settings</Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
