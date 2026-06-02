import { useEffect, useRef, useCallback, useState } from 'react';

interface UseAutoUpdateDataOptions {
  /** Interval in milliseconds to poll for data updates (default: 5000ms = 5 seconds) */
  pollInterval?: number;
  /** Enable auto-update (default: true) */
  enabled?: boolean;
  /** Callback when update is about to happen */
  onUpdateStart?: () => void;
  /** Callback when update completes */
  onUpdateComplete?: (data: any) => void;
  /** Callback when update fails */
  onUpdateError?: (error: Error) => void;
  /** Callback when new data is detected */
  onDataChange?: (data: any) => void;
}

/**
 * Custom hook for auto-updating data from MCP and backend services
 * Provides periodic polling for data changes and real-time sync indicators
 * 
 * Usage:
 * ```tsx
 * const { 
 *   isUpdating, 
 *   lastUpdated, 
 *   update, 
 *   startPolling, 
 *   stopPolling 
 * } = useAutoUpdateData({
 *   pollInterval: 5000,
 *   onDataChange: (data) => console.log('Data changed:', data)
 * });
 * ```
 */
export const useAutoUpdateData = (
  fetchFunction: () => Promise<any>,
  options: UseAutoUpdateDataOptions = {}
) => {
  const {
    pollInterval = 5000,
    enabled = true,
    onUpdateStart,
    onUpdateComplete,
    onUpdateError,
    onDataChange,
  } = options;

  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);
  const [updateCount, setUpdateCount] = useState(0);

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDataRef = useRef<any>(null);
  const isMountedRef = useRef(true);

  // Single update function
  const update = useCallback(async () => {
    if (!enabled || isUpdating) return;

    try {
      setIsUpdating(true);
      setLastError(null);
      onUpdateStart?.();

      const data = await fetchFunction();

      // Check if component is still mounted
      if (!isMountedRef.current) return;

      // Detect data changes
      const dataChanged = JSON.stringify(lastDataRef.current) !== JSON.stringify(data);
      if (dataChanged) {
        onDataChange?.(data);
        lastDataRef.current = data;
      }

      setLastUpdated(new Date());
      setUpdateCount(prev => prev + 1);
      onUpdateComplete?.(data);
    } catch (error) {
      if (!isMountedRef.current) return;
      const err = error instanceof Error ? error : new Error(String(error));
      setLastError(err);
      onUpdateError?.(err);
      console.error('Auto-update error:', err);
    } finally {
      if (isMountedRef.current) {
        setIsUpdating(false);
      }
    }
  }, [enabled, isUpdating, fetchFunction, onUpdateStart, onUpdateComplete, onUpdateError, onDataChange]);

  // Start polling
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return; // Already polling

    // Do initial update immediately
    update();

    // Then start polling
    pollingIntervalRef.current = setInterval(() => {
      update();
    }, pollInterval);
  }, [update, pollInterval]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Auto-start polling if enabled
  useEffect(() => {
    if (enabled) {
      startPolling();
    }
    return () => {
      stopPolling();
    };
  }, [enabled, startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  return {
    /** Whether data is currently being fetched */
    isUpdating,
    /** Timestamp of last successful update */
    lastUpdated,
    /** Last error that occurred during update */
    lastError,
    /** Number of successful updates */
    updateCount,
    /** Manually trigger an update */
    update,
    /** Start polling for updates */
    startPolling,
    /** Stop polling for updates */
    stopPolling,
    /** Get formatted last updated time */
    getFormattedLastUpdated: () => {
      if (!lastUpdated) return 'Never';
      const now = new Date();
      const diff = now.getTime() - lastUpdated.getTime();
      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) return `${seconds}s ago`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      return `${hours}h ago`;
    },
  };
};

/**
 * Hook for auto-updating multiple data sources simultaneously
 */
export const useAutoUpdateMultiple = (
  fetchFunctions: Record<string, () => Promise<any>>,
  options: UseAutoUpdateDataOptions = {}
) => {
  const {
    pollInterval = 5000,
    enabled = true,
  } = options;

  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [data, setData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, Error | null>>({});

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const update = useCallback(async () => {
    if (!enabled || isUpdating) return;

    try {
      setIsUpdating(true);
      
      const results: Record<string, any> = {};
      const newErrors: Record<string, Error | null> = {};

      // Fetch all data sources in parallel
      await Promise.all(
        Object.entries(fetchFunctions).map(async ([key, fetchFn]) => {
          try {
            results[key] = await fetchFn();
            newErrors[key] = null;
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            newErrors[key] = err;
            console.error(`Auto-update error for ${key}:`, err);
          }
        })
      );

      if (!isMountedRef.current) return;

      setData(results);
      setErrors(newErrors);
      setLastUpdated(new Date());
    } finally {
      if (isMountedRef.current) {
        setIsUpdating(false);
      }
    }
  }, [enabled, isUpdating, fetchFunctions]);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    update();
    pollingIntervalRef.current = setInterval(() => {
      update();
    }, pollInterval);
  }, [update, pollInterval]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      startPolling();
    }
    return () => {
      stopPolling();
    };
  }, [enabled, startPolling, stopPolling]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  return {
    isUpdating,
    lastUpdated,
    data,
    errors,
    update,
    startPolling,
    stopPolling,
  };
};

export default useAutoUpdateData;
