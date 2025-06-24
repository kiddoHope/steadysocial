
import { useState, useEffect, useCallback } from 'react';

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

  useEffect(() => {
    if (!appId || !sdkUrl) {
      setError("Facebook App ID or SDK URL is not configured.");
      setIsSdkLoaded(false);
      setIsSdkInitialized(false);
      return;
    }

    if (window.FB) {
        // SDK might be already loaded by another instance or a previous attempt
        console.log("FB SDK already detected.");
        setFbInstance(window.FB);
        setIsSdkLoaded(true);
        // Attempt to initialize if not already done, or if appId changed
        // This simple check might not cover all re-initialization scenarios perfectly.
        if (window.FB.AppEvents && window.FB.AppEvents.EventNames) { // A way to check if init ran
             // Assuming if AppEvents exist, it's initialized. This is a heuristic.
            setIsSdkInitialized(true);
        } else {
             window.FB.init({
                appId,
                cookie: true,
                xfbml: true,
                version: 'v19.0',
                autoLogAppEvents: true,
            });
            setIsSdkInitialized(true);
        }
        return;
    }
    
    // Check if the script is already in the document
    if (document.getElementById('facebook-jssdk')) {
        // Script tag exists, but window.FB might not be ready yet.
        // fbAsyncInit should handle setting window.FB and initialization.
        // We rely on fbAsyncInit to set isSdkLoaded and isSdkInitialized.
        return;
    }


    window.fbAsyncInit = () => {
      try {
        window.FB.init({
          appId,
          cookie: true,
          xfbml: true,
          version: 'v19.0',
          autoLogAppEvents: true,
        });
        setFbInstance(window.FB);
        setIsSdkLoaded(true);
        setIsSdkInitialized(true);
        console.log("Facebook SDK initialized via fbAsyncInit.");
      } catch (e: any) {
        console.error("Error initializing Facebook SDK:", e);
        setError(`Failed to initialize Facebook SDK: ${e.message}`);
        setIsSdkInitialized(false);
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
      setIsSdkLoaded(false); // Explicitly set to false on script load error
      setIsSdkInitialized(false);
    };
    document.head.appendChild(script);
    console.log("Facebook SDK script appended to head.");

    return () => {
      // Clean up script if component unmounts, though SDK usually stays loaded.
      // const existingScript = document.getElementById('facebook-jssdk');
      // if (existingScript) document.head.removeChild(existingScript);
      // window.fbAsyncInit = undefined; // Clean up global function
    };
  }, [appId, sdkUrl]);

  const fbApi = useCallback(
    async <T>(path: string, method: 'get' | 'post' | 'delete' = 'get', params: Record<string, any> = {}): Promise<T> => {
      if (!isSdkInitialized || !fbInstance) {
        const errorMessage = "Facebook SDK is not initialized or available.";
        console.error(errorMessage, {isSdkInitialized, fbInstanceExists: !!fbInstance});
        setError(errorMessage); // Update error state
        return Promise.reject(new Error(errorMessage));
      }

      return new Promise<T>((resolve, reject) => {
        fbInstance.api(path, method, params, (response: any) => {
          if (response && !response.error) {
            resolve(response as T);
          } else {
            console.error('Facebook API Error:', response?.error);
            const apiError = response?.error?.message || 'Unknown Facebook API error.';
            setError(apiError); // Update error state
            reject(new Error(apiError));
          }
        });
      });
    },
    [isSdkInitialized, fbInstance] // fbInstance added as dependency
  );

  return { isSdkLoaded, isSdkInitialized, fbApi, error, FB: fbInstance };
};

export default useFacebookSDK;
