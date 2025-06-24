import { useState, useEffect, useCallback, useRef } from 'react';

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

interface FacebookSDKHook {
  isSdkLoaded: boolean;
  isSdkInitialized: boolean;
  fbApi: <T>(path: string, method?: 'get' | 'post' | 'delete', params?: Record<string, any>) => Promise<T>;
  error: string | null;
  FB?: any; // Expose FB object if needed
}

const useFacebookSDK = (appId?: string, sdkUrl?: string): FacebookSDKHook => {
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const [isSdkInitialized, setIsSdkInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fbInstance, setFbInstance] = useState<any>(null);
  const currentAppIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!appId || !sdkUrl) {
      setError("Facebook App ID or SDK URL is not configured.");
      setIsSdkLoaded(false);
      setIsSdkInitialized(false);
      currentAppIdRef.current = undefined;
      return;
    }

    const initializeFacebookSdk = (currentFbAppId: string) => {
      console.log(`FB.init called for App ID: ${currentFbAppId}, Version: v22.0`);
      window.FB.init({
        appId: currentFbAppId,
        cookie: true,
        xfbml: true,
        version: 'v22.0',
        autoLogAppEvents: true,
      });
      setFbInstance(window.FB);
      setIsSdkInitialized(true);
      currentAppIdRef.current = currentFbAppId; // Update ref to current initialized App ID
      console.log(`Facebook SDK initialized for App ID: ${currentFbAppId}`);
    };

    if (window.FB) { // SDK script is loaded
      console.log(`FB SDK already detected. Current target App ID: ${appId}, Previously initialized App ID: ${currentAppIdRef.current}`);
      setFbInstance(window.FB); // Ensure fbInstance is set
      setIsSdkLoaded(true);
      if (appId !== currentAppIdRef.current || !isSdkInitialized) {
        // App ID has changed or was not initialized, re-initialize
        setIsSdkInitialized(false); // Reset while re-initializing
        try {
          initializeFacebookSdk(appId);
        } catch (e: any) {
          console.error("Error re-initializing Facebook SDK:", e);
          setError(`Failed to re-initialize Facebook SDK: ${e.message}`);
          setIsSdkInitialized(false);
        }
      } else {
         console.log(`SDK already initialized with correct App ID: ${appId}`);
         if(!isSdkInitialized) setIsSdkInitialized(true); // Ensure state is correct if ref matches but state was false
      }
      return;
    }
    
    // If script tag exists but window.FB is not yet ready
    if (document.getElementById('facebook-jssdk')) {
        console.log("Facebook SDK script tag exists, waiting for fbAsyncInit.");
        // fbAsyncInit will handle the initialization.
        // It's important that fbAsyncInit uses the LATEST appId prop if it fires after appId changes.
        // This is tricky if fbAsyncInit is set once. We need it to be dynamic.
        // So, we'll redefine fbAsyncInit each time appId/sdkUrl changes and script isn't loaded.
    }

    window.fbAsyncInit = () => {
      try {
        // Use the appId from the closure of this useEffect instance
        console.log(`fbAsyncInit called. Target App ID: ${appId}`);
        if (!appId) { // Safety check if appId became undefined before fbAsyncInit ran
            console.error("fbAsyncInit called but App ID is undefined.");
            setError("Cannot initialize SDK: App ID became undefined.");
            return;
        }
        initializeFacebookSdk(appId);
        setIsSdkLoaded(true); // Set loaded here as script is now fully processed
      } catch (e: any) {
        console.error("Error initializing Facebook SDK via fbAsyncInit:", e);
        setError(`Failed to initialize Facebook SDK: ${e.message}`);
        setIsSdkInitialized(false);
        setIsSdkLoaded(true); // Script loaded, but init failed
      }
    };

    const script = document.createElement('script');
    script.src = sdkUrl;
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => {
      console.error("Failed to load Facebook SDK script.");
      setError("Failed to load Facebook SDK script. Check SDK URL and network.");
      setIsSdkLoaded(false); 
      setIsSdkInitialized(false);
      currentAppIdRef.current = undefined;
    };
    console.log(`Appending Facebook SDK script for App ID: ${appId}, URL: ${sdkUrl}`);
    document.head.appendChild(script);

    return () => {
      // Cleanup of global fbAsyncInit is complex if multiple instances try to set it.
      // Usually, SDK script remains loaded.
    };
  }, [appId, sdkUrl, isSdkInitialized]); // Added isSdkInitialized to re-check if it somehow got false

  const fbApi = useCallback(
    async <T>(path: string, method: 'get' | 'post' | 'delete' = 'get', params: Record<string, any> = {}): Promise<T> => {
      if (!isSdkInitialized || !fbInstance) {
        const errorMessage = "Facebook SDK is not initialized or available for API calls.";
        console.error(errorMessage, {isSdkInitialized, fbInstanceExists: !!fbInstance});
        setError(errorMessage);
        return Promise.reject(new Error(errorMessage));
      }

      return new Promise<T>((resolve, reject) => {
        fbInstance.api(path, method, params, (response: any) => {
          if (response && !response.error) {
            resolve(response as T);
          } else {
            console.error('Facebook API Error:', response?.error);
            const apiError = response?.error?.message || 'Unknown Facebook API error.';
            setError(apiError); 
            reject(new Error(apiError));
          }
        });
      });
    },
    [isSdkInitialized, fbInstance] 
  );

  return { isSdkLoaded, isSdkInitialized, fbApi, error, FB: fbInstance };
};

export default useFacebookSDK;