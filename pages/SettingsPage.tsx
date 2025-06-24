import React, { useState, useEffect, useCallback } from 'react';
import Input from '../components/ui/Input';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { FacebookIcon } from '../components/icons/FacebookIcon';
import { ChartBarIcon } from '../components/icons/ChartBarIcon';
import { InformationCircleIcon } from '../components/icons/InformationCircleIcon';
import { FacebookPage, FacebookSettings } from '../types';
import Button from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getFacebookSettings, saveFacebookSettings } from '../services/settingsService';
import useFacebookSDK from '../hooks/useFacebookSDK';
import Alert from '../components/ui/Alert';
import Select from '../components/ui/Select'; // Ensure Select is imported

export const SettingsPage: React.FC = () => {
  const { logout: appLogout } = useAuth();
  const navigate = useNavigate();

  // --- Initial settings load ---
  const [initialFbSettings, setInitialFbSettings] = useState<FacebookSettings | null>(null);

  // --- State for Main Facebook App (Analytics/Pages) ---
  const [inputFbAppId, setInputFbAppId] = useState('');
  const [configuredFbAppId, setConfiguredFbAppId] = useState<string | null>(null);
  const [mainAppLoginStatus, setMainAppLoginStatus] = useState<'unknown' | 'connected' | 'not_authorized'>('unknown');
  const [mainAppUserID, setMainAppUserID] = useState<string | null>(null);
  const [fbPages, setFbPages] = useState<FacebookPage[]>([]); // Pages related to Main App
  const [selectedFbPageId, setSelectedFbPageId] = useState<string>(''); // For Main App
  const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [pageAnalytics, setPageAnalytics] = useState<Record<string, any> | null>(null);

  // --- State for Messaging Facebook App ---
  const [inputFbMessagingAppId, setInputFbMessagingAppId] = useState('');
  const [configuredFbMessagingAppId, setConfiguredFbMessagingAppId] = useState<string | null>(null);
  const [messagingAppLoginStatus, setMessagingAppLoginStatus] = useState<'unknown' | 'connected' | 'not_authorized'>('unknown');
  const [messagingAppUserID, setMessagingAppUserID] = useState<string | null>(null);
  
  // --- SDK Control and Shared FB State ---
  const [sdkTargetAppId, setSdkTargetAppId] = useState<string | undefined>(undefined);
  const [loginAttemptTarget, setLoginAttemptTarget] = useState<'main' | 'messaging' | null>(null);
  const [isFbProcessing, setIsFbProcessing] = useState(false);
  const [fbActionMessage, setFbActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Load initial settings from localStorage
  useEffect(() => {
    const settings = getFacebookSettings();
    setInitialFbSettings(settings);
    
    setInputFbAppId(settings.appId || '');
    setConfiguredFbAppId(settings.appId || null);

    setInputFbMessagingAppId(settings.messagingAppId || '');
    setConfiguredFbMessagingAppId(settings.messagingAppId || null);

    // Default SDK target to main app ID if configured, otherwise undefined
    setSdkTargetAppId(settings.appId || undefined); 
  }, []);

  const { 
    isSdkLoaded, 
    isSdkInitialized, 
    fbApi, 
    error: sdkError, 
    FB: fbInstance 
  } = useFacebookSDK(sdkTargetAppId, initialFbSettings?.sdkUrl);


  const handleSaveFacebookConfig = useCallback(() => {
    if (!inputFbAppId.trim() && !inputFbMessagingAppId.trim()) {
      setFbActionMessage({ type: 'error', text: 'At least one Facebook App ID must be provided.' });
      return;
    }
    setIsFbProcessing(true);
    setFbActionMessage(null);
    try {
      const newSettings: Partial<FacebookSettings> = { 
        appId: inputFbAppId.trim(),
        messagingAppId: inputFbMessagingAppId.trim() 
      };
      saveFacebookSettings(newSettings);
      
      const savedMainAppId = inputFbAppId.trim();
      const savedMessagingAppId = inputFbMessagingAppId.trim();

      setConfiguredFbAppId(savedMainAppId || null);
      setConfiguredFbMessagingAppId(savedMessagingAppId || null);
      
      setInitialFbSettings(prev => ({...(prev || {sdkUrl:'', appId:'', pageId:''}), ...newSettings}));

      // Decide which App ID to target for SDK if current target becomes empty
      if (sdkTargetAppId === configuredFbAppId && !savedMainAppId && savedMessagingAppId) {
        setSdkTargetAppId(savedMessagingAppId);
      } else if (sdkTargetAppId === configuredFbMessagingAppId && !savedMessagingAppId && savedMainAppId) {
        setSdkTargetAppId(savedMainAppId);
      } else if (!sdkTargetAppId && savedMainAppId) {
        setSdkTargetAppId(savedMainAppId);
      } else if (!sdkTargetAppId && savedMessagingAppId) {
        setSdkTargetAppId(savedMessagingAppId);
      }
      // If current sdkTargetAppId changed as part of save, useFacebookSDK will re-init
      
      setFbActionMessage({ type: 'success', text: 'Facebook configuration saved. SDK will re-initialize if active App ID changed.' });
    } catch (e) {
      console.error("Failed to save Facebook configuration:", e);
      setFbActionMessage({ type: 'error', text: 'Failed to save Facebook configuration.' });
    } finally {
      setIsFbProcessing(false);
    }
  }, [inputFbAppId, inputFbMessagingAppId, sdkTargetAppId, configuredFbAppId, configuredFbMessagingAppId]);

  const FB_PERMISSIONS_SCOPE = 'email,public_profile,pages_show_list,read_insights,pages_read_engagement,pages_manage_posts,pages_manage_engagement,pages_read_user_content';

  const fetchPagesForMainApp = useCallback(async () => {
    if (!fbApi) {
      setFbActionMessage({ type: 'error', text: "Cannot fetch pages: Facebook API not available." });
      return;
    }
    setIsFbProcessing(true);
    setFbActionMessage({ type: 'info', text: "Fetching Facebook pages for Main App..." });
    try {
      const pagesResponse = await fbApi<{data: FacebookPage[]}>('/me/accounts?fields=id,name,access_token');
      setFbPages(pagesResponse.data || []);
      if (pagesResponse.data && pagesResponse.data.length > 0) {
        setSelectedFbPageId(pagesResponse.data[0].id);
        setFbActionMessage({ type: 'success', text: 'Main App connected. Facebook pages loaded.' });
      } else {
        setFbActionMessage({ type: 'info', text: 'Main App connected, but no Facebook pages found or permission not granted.' });
      }
    } catch (err: any) {
      console.error("Error fetching pages for Main App:", err);
      setFbActionMessage({ type: 'error', text: `Main App connected, but failed to fetch pages: ${err.message}` });
    } finally {
      setIsFbProcessing(false);
    }
  }, [fbApi]);


  // Effect to handle login after SDK is ready for the target app and a login attempt is triggered
  useEffect(() => {
    if (isSdkInitialized && fbInstance && loginAttemptTarget) {
      setIsFbProcessing(true);
      const target = loginAttemptTarget; // 'main' or 'messaging'
      
      setFbActionMessage({type: 'info', text: `Checking login status for ${target === 'main' ? 'Main' : 'Messenger'} App...`});

      fbInstance.getLoginStatus((response: any) => {
        if (response.status === 'connected') {
          if (target === 'main') {
            setMainAppLoginStatus('connected');
            setMainAppUserID(response.authResponse.userID);
            fetchPagesForMainApp(); 
          } else { // messaging
            setMessagingAppLoginStatus('connected');
            setMessagingAppUserID(response.authResponse.userID);
          }
          setFbActionMessage({type: 'success', text: `Already connected with ${target} App.`});
          setIsFbProcessing(false);
          setLoginAttemptTarget(null);
        } else { 
          setFbActionMessage({type: 'info', text: `Attempting login with ${target} App...`});
          fbInstance.login((loginResponse: any) => {
            if (loginResponse.authResponse) {
              if (target === 'main') {
                setMainAppLoginStatus('connected');
                setMainAppUserID(loginResponse.authResponse.userID);
                fetchPagesForMainApp();
              } else { 
                setMessagingAppLoginStatus('connected');
                setMessagingAppUserID(loginResponse.authResponse.userID);
                setFbActionMessage({type: 'success', text: `Successfully connected with Messenger App.`});
              }
            } else {
              if (target === 'main') setMainAppLoginStatus('not_authorized');
              else setMessagingAppLoginStatus('not_authorized');
              setFbActionMessage({type: 'error', text: `${target} App login failed or was cancelled.`});
            }
            setIsFbProcessing(false);
            setLoginAttemptTarget(null);
          }, { scope: FB_PERMISSIONS_SCOPE });
        }
      });
    }
  }, [isSdkInitialized, fbInstance, loginAttemptTarget, fetchPagesForMainApp]);
  

  const handleConnect = (target: 'main' | 'messaging') => {
    const targetAppId = target === 'main' ? configuredFbAppId : configuredFbMessagingAppId;
    if (!targetAppId) {
      setFbActionMessage({ type: 'error', text: `${target === 'main' ? 'Main' : 'Messaging'} App ID is not configured.` });
      return;
    }
    setSdkTargetAppId(targetAppId); // This will trigger useFacebookSDK to re-evaluate
    setLoginAttemptTarget(target); // This will trigger the login useEffect once SDK is ready for targetAppId
  };

  const handleDisconnect = (target: 'main' | 'messaging') => {
    if (!fbInstance || !isSdkInitialized) {
      setFbActionMessage({type: 'error', text: "Facebook SDK not ready for logout."});
      return;
    }
    // Ensure SDK is targeting the correct app before logout
    const targetAppIdToDisconnect = target === 'main' ? configuredFbAppId : configuredFbMessagingAppId;
    if (sdkTargetAppId !== targetAppIdToDisconnect) {
        setSdkTargetAppId(targetAppIdToDisconnect || undefined);
        // Wait for SDK to re-init with target, then logout (complex, ideally logout works on current FB session)
        // For simplicity, we assume logout acts on the current browser FB session if any.
        // If SDK needs to target specific app ID for logout, this flow gets more involved.
    }

    setIsFbProcessing(true);
    setFbActionMessage({type: 'info', text: `Disconnecting from ${target} App...`});
    fbInstance.logout(() => {
      if (target === 'main') {
        setMainAppLoginStatus('unknown');
        setMainAppUserID(null);
        setFbPages([]);
        setSelectedFbPageId('');
        setPageAnalytics(null);
        setAnalyticsError(null);
      } else { // messaging
        setMessagingAppLoginStatus('unknown');
        setMessagingAppUserID(null);
      }
      setFbActionMessage({type: 'success', text: `Successfully disconnected from ${target} App.`});
      setIsFbProcessing(false);
    });
  };

  const handleFetchPageAnalytics = useCallback(async () => {
    // Analytics are tied to the Main App context and selectedFbPageId
    if (!selectedFbPageId || !fbApi || mainAppLoginStatus !== 'connected') {
        setAnalyticsError("Main App not connected or no page selected for analytics.");
        return;
    }
    if (sdkTargetAppId !== configuredFbAppId) {
        setAnalyticsError("SDK not targeting Main App. Connect with Main App to fetch analytics.");
        // Optionally, could try to switch SDK target here, but might be disruptive.
        return;
    }

    setIsFetchingAnalytics(true);
    setAnalyticsError(null);
    setPageAnalytics(null);

    const selectedPageObject = fbPages.find(p => p.id === selectedFbPageId);
    if (!selectedPageObject?.access_token) {
        setAnalyticsError("Page Access Token not found. Try reconnecting Main App or re-selecting page.");
        setIsFetchingAnalytics(false);
        return;
    }
    const pageAccessToken = selectedPageObject.access_token;

    try {
        const response = await fbApi<any>(`/${selectedFbPageId}/insights?metric=page_impressions_unique&period=day&date_preset=last_28_days&access_token=${pageAccessToken}`);
        const impressions = response?.data?.[0]?.values?.reduce((sum: number, val: {value: number}) => sum + val.value, 0) ?? 'N/A';
        setPageAnalytics({ impressions });
        setFbActionMessage({ type: 'success', text: 'Analytics fetched for selected page.' });
    } catch (err: any) {
        setAnalyticsError(err.message || "Failed to fetch analytics.");
    } finally {
        setIsFetchingAnalytics(false);
    }
  }, [selectedFbPageId, fbApi, mainAppLoginStatus, fbPages, sdkTargetAppId, configuredFbAppId]);

  const handleAppLogout = () => {
    appLogout();
    navigate('/login');
  };
  
  const currentSdkTargetIsMain = sdkTargetAppId === configuredFbAppId && configuredFbAppId;
  const currentSdkTargetIsMessaging = sdkTargetAppId === configuredFbMessagingAppId && configuredFbMessagingAppId;

  return (
    <div className="animate-fadeIn">
      <header className="mb-6 md:mb-8">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Settings</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Configure Facebook integration and manage your application session.
        </p>
      </header>
      
      {sdkError && (!loginAttemptTarget) && <Alert type="error" message={`SDK Error: ${sdkError}`} className="mb-4" />}
      {fbActionMessage && (
          <Alert type={fbActionMessage.type} message={fbActionMessage.text} onClose={() => setFbActionMessage(null)} className="mb-4"/>
      )}

      {/* Common Save Button */}
      <section className="p-4 sm:p-6 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 max-w-2xl mx-auto mb-6">
        <h2 className="text-xl font-semibold text-primary-500 dark:text-primary-400 mb-3">Facebook App Configuration</h2>
        <Input 
            id="fbAppIdInput" 
            label="Main Facebook App ID (for Analytics, Pages)" 
            value={inputFbAppId} 
            onChange={(e) => setInputFbAppId(e.target.value)} 
            placeholder="Enter Main App ID" 
            disabled={isFbProcessing} 
            wrapperClassName="mb-3"
        />
        <Input 
            id="fbMessagingAppIdInput" 
            label="Facebook Messaging App ID" 
            value={inputFbMessagingAppId} 
            onChange={(e) => setInputFbMessagingAppId(e.target.value)} 
            placeholder="Enter Messaging App ID (e.g., 1084...)" 
            disabled={isFbProcessing} 
            wrapperClassName="mb-3"
        />
        <Button 
            onClick={handleSaveFacebookConfig}
            disabled={isFbProcessing || (!inputFbAppId.trim() && !inputFbMessagingAppId.trim())} 
            variant="secondary"
            className="w-full"
            isLoading={isFbProcessing && fbActionMessage?.text.includes("save")}
        >
            Save Facebook Configuration
        </Button>
      </section>

      {/* Main App Integration Section */}
      <section className="p-4 sm:p-6 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 max-w-2xl mx-auto mb-6">
        <h2 className="text-xl font-semibold text-primary-500 dark:text-primary-400 mb-1">Facebook Integration (Main App)</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">For Page analytics and general Facebook actions.</p>
        
        {!configuredFbAppId && <p className="text-sm text-orange-500 dark:text-orange-400">Main App ID not configured.</p>}
        {configuredFbAppId && !isSdkLoaded && currentSdkTargetIsMain && <p className="text-sm text-yellow-500 dark:text-yellow-400 flex items-center"><LoadingSpinner size="sm" className="mr-2"/>SDK loading for Main App...</p>}
        {configuredFbAppId && isSdkLoaded && !isSdkInitialized && currentSdkTargetIsMain && <p className="text-sm text-yellow-500 dark:text-yellow-400 flex items-center"><LoadingSpinner size="sm" className="mr-2"/>SDK initializing for Main App...</p>}

        {configuredFbAppId && mainAppLoginStatus !== 'connected' && (
          <Button
            onClick={() => handleConnect('main')}
            disabled={isFbProcessing || !configuredFbAppId || (sdkTargetAppId === configuredFbAppId && !isSdkInitialized)}
            variant="primary"
            className="w-full my-2 py-3"
            icon={isFbProcessing && loginAttemptTarget === 'main' ? <LoadingSpinner size="sm" className="text-white"/> : <FacebookIcon className="w-5 h-5"/>}
          >
            Connect with Main App
          </Button>
        )}
        {mainAppLoginStatus === 'connected' && (
          <>
            <p className="text-sm text-green-600 dark:text-green-400 mb-2">Connected with Main App (User ID: {mainAppUserID})</p>
            {fbPages.length > 0 && (
              <div className="my-2">
                 <Select
                  label="Select Page for Analytics:"
                  id="fbPageSelect" 
                  value={selectedFbPageId} 
                  onChange={(e) => setSelectedFbPageId(e.target.value)}
                  disabled={isFbProcessing || !currentSdkTargetIsMain || mainAppLoginStatus !== 'connected'}
                  options={fbPages.map(page => ({ value: page.id, label: page.name }))}
                  wrapperClassName="mb-0"
                />
              </div>
            )}
            {selectedFbPageId && mainAppLoginStatus === 'connected' && (
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-600">
                     <h3 className="text-md font-semibold text-primary-500 dark:text-primary-400 mb-2 flex items-center"><ChartBarIcon className="w-5 h-5 mr-2"/>Page Analytics</h3>
                     <Button 
                        onClick={handleFetchPageAnalytics}
                        disabled={!selectedFbPageId || isFetchingAnalytics || !currentSdkTargetIsMain}
                        variant="primary"
                        className="w-full mb-2 opacity-80 hover:opacity-100"
                        icon={isFetchingAnalytics ? <LoadingSpinner size="sm" className="text-white" /> : <ChartBarIcon className="w-4 h-4"/>}
                      >
                       {isFetchingAnalytics ? 'Fetching Analytics...' : 'Fetch Analytics'}
                     </Button>
                     {analyticsError && <Alert type="error" message={analyticsError} onClose={()=>setAnalyticsError(null)} className="text-xs"/>}
                     {pageAnalytics && !isFetchingAnalytics && !analyticsError && (
                        <div className="my-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-md text-xs border border-slate-200 dark:border-slate-600">
                           {Object.entries(pageAnalytics).map(([key, value]) => (
                                <div key={key} className="flex justify-between">
                                    <span className="capitalize">{key.replace(/_/g, ' ')}:</span>
                                    <span>{typeof value === 'number' ? value.toLocaleString() : String(value)}</span>
                                </div>
                            ))}
                        </div>
                     )}
                </div>
            )}
            <Button onClick={() => handleDisconnect('main')} variant="danger" className="w-full mt-2 py-3" icon={<FacebookIcon className="w-5 h-5"/>}>
              Disconnect Main App
            </Button>
          </>
        )}
      </section>

      {/* Messenger App Integration Section */}
      <section className="p-4 sm:p-6 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 max-w-2xl mx-auto mb-6">
        <h2 className="text-xl font-semibold text-primary-500 dark:text-primary-400 mb-1">Messenger Integration</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">For Facebook Page chat functionalities.</p>

        {!configuredFbMessagingAppId && <p className="text-sm text-orange-500 dark:text-orange-400">Messaging App ID not configured.</p>}
        {configuredFbMessagingAppId && !isSdkLoaded && currentSdkTargetIsMessaging && <p className="text-sm text-yellow-500 dark:text-yellow-400 flex items-center"><LoadingSpinner size="sm" className="mr-2"/>SDK loading for Messaging App...</p>}
        {configuredFbMessagingAppId && isSdkLoaded && !isSdkInitialized && currentSdkTargetIsMessaging && <p className="text-sm text-yellow-500 dark:text-yellow-400 flex items-center"><LoadingSpinner size="sm" className="mr-2"/>SDK initializing for Messaging App...</p>}

        {configuredFbMessagingAppId && messagingAppLoginStatus !== 'connected' && (
          <Button
            onClick={() => handleConnect('messaging')}
            disabled={isFbProcessing || !configuredFbMessagingAppId || (sdkTargetAppId === configuredFbMessagingAppId && !isSdkInitialized)}
            variant="primary"
            className="w-full my-2 py-3"
            icon={isFbProcessing && loginAttemptTarget === 'messaging' ? <LoadingSpinner size="sm" className="text-white"/> : <FacebookIcon className="w-5 h-5"/>}
          >
            Connect with Messaging App
          </Button>
        )}
        {messagingAppLoginStatus === 'connected' && (
          <>
            <p className="text-sm text-green-600 dark:text-green-400 mb-2">Connected with Messaging App (User ID: {messagingAppUserID})</p>
            <Button onClick={() => handleDisconnect('messaging')} variant="danger" className="w-full mt-2 py-3" icon={<FacebookIcon className="w-5 h-5"/>}>
              Disconnect Messaging App
            </Button>
          </>
        )}
      </section>
      
      {/* General Info and App Logout */}
      <section className="p-4 sm:p-6 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 max-w-2xl mx-auto">
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-800/40 border border-yellow-300 dark:border-yellow-600 rounded-lg text-sm text-yellow-700 dark:text-yellow-200 flex items-start">
            <InformationCircleIcon className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-yellow-500 dark:text-yellow-400" />
            <div>
                <strong className="font-semibold">Important Notes:</strong>
                <ul className="list-disc list-inside mt-1">
                    <li>Ensure "Login with JavaScript SDK" is enabled for both App IDs on <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="font-medium underline hover:text-yellow-800 dark:hover:text-yellow-100">developers.facebook.com</a>.</li>
                    <li>Permissions like `pages_messaging`, `pages_read_engagement`, etc., require App Review by Facebook for live apps.</li>
                    <li>If you change App IDs, the SDK will re-initialize. You may need to re-connect.</li>
                     <li>Disconnecting one app context does not necessarily log you out of Facebook entirely in your browser.</li>
                </ul>
            </div>
        </div>
        <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-3">Account Actions</h2>
        <Button onClick={handleAppLogout} variant="secondary" className="w-full py-3">
          Logout from SteadySocial
        </Button>
      </section>
    </div>
  );
};

export const Settings = SettingsPage; // For named export consistency if needed elsewhere
export default SettingsPage;