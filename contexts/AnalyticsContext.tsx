import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { 
    FacebookSettings, 
    FacebookPage,
    FBPageInfo,
    FBInsightValue,
    FBInsightsData,
    FBInsightsResponse,
    FBPost,
    FBPostsResponse,
    FBManagedPagesResponse
} from '../types';
import { dbGetFacebookSettings } from '../services/settingsService'; // For fetching initial settings


type FBAPIFunction = <T>(path: string, method?: 'get' | 'post' | 'delete', params?: Record<string, any>) => Promise<T>;

interface KpiDataType {
  reach: number | null;
  engagement: number | null;
  postsPublished: number | null;
  followers: number | null;
  newFollowers: number | null;
}

interface AnalyticsContextType {
  fbPageInfo: FBPageInfo | null;
  kpiData: KpiDataType;
  engagementOverTime: FBInsightValue[];
  topPosts: FBPost[];
  pageAccessToken: string | null;
  isLoadingAnalytics: boolean;
  analyticsError: string | null;
  loadAnalytics: (fbApi: FBAPIFunction, forceRefresh?: boolean) => Promise<void>;
  lastFetchedPageId: string | null;
  isLoadingFbSettings: boolean; 
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export const AnalyticsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [fbPageInfo, setFbPageInfo] = useState<FBPageInfo | null>(null);
  const [pageAccessToken, setPageAccessToken] = useState<string | null>(null);
  const [kpiData, setKpiData] = useState<KpiDataType>({
    reach: null, engagement: null, postsPublished: null, followers: null, newFollowers: null
  });
  const [engagementOverTime, setEngagementOverTime] = useState<FBInsightValue[]>([]);
  const [topPosts, setTopPosts] = useState<FBPost[]>([]);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [lastFetchedPageId, setLastFetchedPageId] = useState<string | null>(null);
  const [fbSettings, setFbSettings] = useState<FacebookSettings | null>(null);
  const [isLoadingFbSettings, setIsLoadingFbSettings] = useState(true);

  // Fetch Facebook settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoadingFbSettings(true);
      try {
        const settings = await dbGetFacebookSettings();
        setFbSettings(settings);
      } catch (err) {
        console.error("AnalyticsContext: Failed to fetch Facebook settings", err);
        setAnalyticsError("Could not load Facebook configuration for analytics.");
      } finally {
        setIsLoadingFbSettings(false);
      }
    };
    fetchSettings();
  }, []);

  const loadAnalytics = useCallback(async (
    fbApi: FBAPIFunction,
    forceRefresh: boolean = false
  ) => {
    if (isLoadingFbSettings || !fbSettings) {
      // Do not proceed if settings are still loading or not available
      if(!isLoadingFbSettings && !fbSettings) setAnalyticsError("Facebook settings not available for analytics.");
      return;
    }

    if (!fbSettings.pageId) {
      setAnalyticsError("Facebook Page ID not configured in settings.");
      // Reset states if pageId is missing
      setFbPageInfo(null);
      setKpiData({ reach: null, engagement: null, postsPublished: null, followers: null, newFollowers: null });
      setEngagementOverTime([]);
      setTopPosts([]);
      setPageAccessToken(null);
      return;
    }

    if (!forceRefresh && lastFetchedPageId === fbSettings.pageId && fbPageInfo) {
      return;
    }

    setIsLoadingAnalytics(true);
    setAnalyticsError(null);
    let currentToken = (lastFetchedPageId === fbSettings.pageId && !forceRefresh) ? pageAccessToken : null;

    try {
      if (!currentToken || forceRefresh || lastFetchedPageId !== fbSettings.pageId) {
        const accountsResponse = await fbApi<FBManagedPagesResponse>('/me/accounts?fields=id,name,access_token');
        const targetPage = accountsResponse.data.find(p => p.id === fbSettings.pageId);
        if (targetPage?.access_token) {
          currentToken = targetPage.access_token;
          setPageAccessToken(currentToken);
        } else {
          throw new Error("Page Access Token not found. Ensure page is managed and permissions granted.");
        }
      }

      if (!currentToken) throw new Error("Failed to obtain Page Access Token.");
      
      setLastFetchedPageId(fbSettings.pageId);

      const pageInfoPromise = fbApi<FBPageInfo>(`/${fbSettings.pageId}?fields=name,fan_count,picture.type(large)&access_token=${currentToken}`);
      const insightsPromise = fbApi<FBInsightsResponse>(
        `/${fbSettings.pageId}/insights?metric=page_impressions_unique,page_post_engagements,page_fans_adds_unique&period=day&date_preset=last_30_days&access_token=${currentToken}`
      );
      const postsCountPromise = fbApi<FBPostsResponse>(
        `/${fbSettings.pageId}/published_posts?limit=100&since=${Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)}&access_token=${currentToken}`
      );
      const latestPostsPromise = fbApi<FBPostsResponse>(
          `/${fbSettings.pageId}/posts?fields=id,message,created_time,permalink_url,attachments{media,subattachments,type,url},insights.metric(post_impressions_unique,post_engaged_users).period(lifetime)&limit=5&access_token=${currentToken}`
      );

      const [pageInfoData, insightsData, postsCountData, latestPostsData] = await Promise.all([
        pageInfoPromise, insightsPromise, postsCountPromise, latestPostsPromise
      ]);

      setFbPageInfo(pageInfoData);
      setTopPosts(latestPostsData.data || []);

      let totalReach = 0, totalEngagement = 0, totalNewFollowers = 0;
      let dailyEngagementValues: FBInsightValue[] = [];

      insightsData.data.forEach(metric => {
        if (metric.name === 'page_impressions_unique' && metric.values) {
          totalReach = metric.values.reduce((sum, val) => sum + (typeof val.value === 'number' ? val.value : 0), 0);
        }
        if (metric.name === 'page_post_engagements' && metric.values) {
          totalEngagement = metric.values.reduce((sum, val) => sum + (typeof val.value === 'number' ? val.value : 0), 0);
          dailyEngagementValues = metric.values.filter(v => typeof v.value === 'number');
        }
        if (metric.name === 'page_fans_adds_unique' && metric.values) {
          totalNewFollowers = metric.values.reduce((sum, val) => sum + (typeof val.value === 'number' ? val.value : 0), 0);
        }
      });
      
      setEngagementOverTime(dailyEngagementValues);
      setKpiData({
        reach: totalReach, engagement: totalEngagement, postsPublished: postsCountData.data?.length || 0,
        followers: pageInfoData.fan_count || 0, newFollowers: totalNewFollowers,
      });

    } catch (err: any) {
      console.error("Error loading Facebook analytics:", err);
      setAnalyticsError(err.message || "An unknown error occurred while fetching analytics.");
      // Reset data on error
      setFbPageInfo(null);
      setKpiData({ reach: null, engagement: null, postsPublished: null, followers: null, newFollowers: null });
      setEngagementOverTime([]);
      setTopPosts([]);
      setPageAccessToken(null);
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [pageAccessToken, lastFetchedPageId, fbPageInfo, fbSettings, isLoadingFbSettings]);

  const contextValue: AnalyticsContextType = {
    fbPageInfo, kpiData, engagementOverTime, topPosts, pageAccessToken,
    isLoadingAnalytics, analyticsError, loadAnalytics, lastFetchedPageId,
    isLoadingFbSettings,
  };

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export const useAnalytics = (): AnalyticsContextType => {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
};
