import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type BrowserState = 'idle' | 'launching' | 'navigating' | 'extracting' | 'analyzing' | 'complete' | 'error';
type LogType = 'info' | 'success' | 'command' | 'error' | 'network';

type DataSource = 'meta' | 'google_trends' | 'tiktok_ads' | 'reddit';

type MarketResearchFilters = {
  niche: string;
  pageUrl: string;
  platform: string;
  status: string;
  country: string;
  resultCount: number;
  timeframe: string;
  impressionDate: string;
  sources: Record<DataSource, boolean>;
  useAI: boolean;
  headless: boolean;
};

type ScraperLog = {
  message: string;
  timestamp: string;
  type: LogType;
};

interface MarketResearchContextType {
  filters: MarketResearchFilters;
  setFilters: React.Dispatch<React.SetStateAction<MarketResearchFilters>>;
  apiEndpoint: string;
  setApiEndpoint: React.Dispatch<React.SetStateAction<string>>;
  response: any | null;
  setResponse: React.Dispatch<React.SetStateAction<any | null>>;
  metaAds: any[];
  setMetaAds: React.Dispatch<React.SetStateAction<any[]>>;
  tiktokAds: any[];
  setTiktokAds: React.Dispatch<React.SetStateAction<any[]>>;
  redditPosts: any[];
  setRedditPosts: React.Dispatch<React.SetStateAction<any[]>>;
  googleTrends: any | null;
  setGoogleTrends: React.Dispatch<React.SetStateAction<any | null>>;
  logs: ScraperLog[];
  setLogs: React.Dispatch<React.SetStateAction<ScraperLog[]>>;
  browserState: BrowserState;
  setBrowserState: React.Dispatch<React.SetStateAction<BrowserState>>;
  progress: number;
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  saveDirectory: string;
  setSaveDirectory: React.Dispatch<React.SetStateAction<string>>;
  planningDirectories: string[];
  setPlanningDirectories: React.Dispatch<React.SetStateAction<string[]>>;
  savedReportPath: string;
  setSavedReportPath: React.Dispatch<React.SetStateAction<string>>;
  clearResearchState: () => void;
}

const STORAGE_KEY = 'steadysocial_market_research_state';
const API_ENDPOINT = 'http://localhost:3001/api/market-research';

const DEFAULT_FILTERS: MarketResearchFilters = {
  niche: '',
  pageUrl: '',
  platform: 'all',
  status: 'active',
  country: 'US',
  resultCount: 50,
  timeframe: '30d',
  impressionDate: '',
  sources: {
    meta: true,
    google_trends: true,
    tiktok_ads: true,
    reddit: true,
  },
  useAI: true,
  headless: true,
};

const normalizeFilters = (value: any): MarketResearchFilters => ({
  ...DEFAULT_FILTERS,
  ...(value && typeof value === 'object' ? value : {}),
  sources: {
    ...DEFAULT_FILTERS.sources,
    ...(value?.sources && typeof value.sources === 'object' ? value.sources : {}),
  },
});

const readPersistedState = () => {
  if (typeof window === 'undefined') return {} as any;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('MarketResearchContext: failed to read saved state.', error);
    return {};
  }
};

const writePersistedState = (payload: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('MarketResearchContext: failed to persist state.', error);
  }
};

const MarketResearchContext = createContext<MarketResearchContextType | undefined>(undefined);

export const MarketResearchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const saved = useMemo(() => readPersistedState(), []);

  const [filters, setFilters] = useState<MarketResearchFilters>(() => normalizeFilters(saved.filters));
  const [apiEndpoint, setApiEndpoint] = useState<string>(() => saved.apiEndpoint || API_ENDPOINT);
  const [response, setResponse] = useState<any | null>(() => saved.response || null);
  const [metaAds, setMetaAds] = useState<any[]>(() => Array.isArray(saved.metaAds) ? saved.metaAds : []);
  const [tiktokAds, setTiktokAds] = useState<any[]>(() => Array.isArray(saved.tiktokAds) ? saved.tiktokAds : []);
  const [redditPosts, setRedditPosts] = useState<any[]>(() => Array.isArray(saved.redditPosts) ? saved.redditPosts : []);
  const [googleTrends, setGoogleTrends] = useState<any | null>(() => saved.googleTrends || null);
  const [logs, setLogs] = useState<ScraperLog[]>(() => Array.isArray(saved.logs) ? saved.logs : []);
  const [browserState, setBrowserState] = useState<BrowserState>(() => saved.browserState || 'idle');
  const [progress, setProgress] = useState<number>(() => Number(saved.progress || 0));
  const [saveDirectory, setSaveDirectory] = useState<string>(() => saved.saveDirectory || '');
  const [planningDirectories, setPlanningDirectories] = useState<string[]>(() => Array.isArray(saved.planningDirectories) ? saved.planningDirectories : ['']);
  const [savedReportPath, setSavedReportPath] = useState<string>(() => saved.savedReportPath || '');

  useEffect(() => {
    writePersistedState({
      filters,
      apiEndpoint,
      response,
      metaAds,
      tiktokAds,
      redditPosts,
      googleTrends,
      logs,
      browserState,
      progress,
      saveDirectory,
      planningDirectories,
      savedReportPath,
    });
  }, [
    filters,
    apiEndpoint,
    response,
    metaAds,
    tiktokAds,
    redditPosts,
    googleTrends,
    logs,
    browserState,
    progress,
    saveDirectory,
    planningDirectories,
    savedReportPath,
  ]);

  const clearResearchState = useCallback(() => {
    setResponse(null);
    setMetaAds([]);
    setTiktokAds([]);
    setRedditPosts([]);
    setGoogleTrends(null);
    setLogs([]);
    setBrowserState('idle');
    setProgress(0);
    setSavedReportPath('');
  }, []);

  const value = useMemo<MarketResearchContextType>(() => ({
    filters,
    setFilters,
    apiEndpoint,
    setApiEndpoint,
    response,
    setResponse,
    metaAds,
    setMetaAds,
    tiktokAds,
    setTiktokAds,
    redditPosts,
    setRedditPosts,
    googleTrends,
    setGoogleTrends,
    logs,
    setLogs,
    browserState,
    setBrowserState,
    progress,
    setProgress,
    saveDirectory,
    setSaveDirectory,
    planningDirectories,
    setPlanningDirectories,
    savedReportPath,
    setSavedReportPath,
    clearResearchState,
  }), [
    filters,
    apiEndpoint,
    response,
    metaAds,
    tiktokAds,
    redditPosts,
    googleTrends,
    logs,
    browserState,
    progress,
    saveDirectory,
    planningDirectories,
    savedReportPath,
    clearResearchState,
  ]);

  return (
    <MarketResearchContext.Provider value={value}>
      {children}
    </MarketResearchContext.Provider>
  );
};

export const useMarketResearch = () => {
  const context = useContext(MarketResearchContext);
  if (!context) {
    throw new Error('useMarketResearch must be used inside MarketResearchProvider. Wrap your routes with <MarketResearchProvider>.');
  }
  return context;
};
