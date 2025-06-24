
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { FacebookSettings, FacebookPage } from '../types'; // Assuming FBPost etc. are in types or imported where needed

// Re-defining interfaces from AnalyticsPage.tsx for context use, or import if they are moved to types.ts
export interface FBPageInfo {
  name?: string;
  fan_count?: number;
  picture?: { data: { url: string } };
}

export interface FBInsightValue {
  value: number | Record<string, number>;
  end_time: string;
}

export interface FBInsightsData {
  name: string;
  period: string;
  values: FBInsightValue[];
  title: string;
  description: string;
  id: string;
}

export interface FBInsightsResponse {
  data: FBInsightsData[];
}

export interface FBPostAttachmentMediaImage {
  height: number;
  src: string;
  width: number;
}

export interface FBPostAttachmentMedia {
  image: FBPostAttachmentMediaImage;
}

export interface FBPostAttachmentSubattachment {
    media: FBPostAttachmentMedia;
    type: string;
}

export interface FBPostAttachmentData {
  media?: FBPostAttachmentMedia;
  subattachments?: { data: FBPostAttachmentSubattachment[] };
  type: string;
  url?: string;
}

export interface FBPostAttachments {
  data: FBPostAttachmentData[];
}

export interface FBPost {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  insights?: {
    data: Array<{
      name: string;
      period: string;
      values: Array<{value: number}>;
    }>;
  };
  attachments?: FBPostAttachments;
}

export interface FBPostsResponse {
  data: FBPost[];
  paging?: any;
}

export interface FBManagedPagesResponse {
  data: FacebookPage[];
}

// Type for the fbApi function from useFacebookSDK hook
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
  loadAnalytics: (fbSettings: FacebookSettings, fbApi: FBAPIFunction, forceRefresh?: boolean) => Promise<void>;
  lastFetchedPageId: string | null;
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

  const loadAnalytics = useCallback(async (
    fbSettings: FacebookSettings,
    fbApi: FBAPIFunction,
    forceRefresh: boolean = false
  ) => {
    if (!fbSettings?.pageId) {
      setAnalyticsError("Facebook Page ID not configured.");
      setFbPageInfo(null);
      setKpiData({ reach: null, engagement: null, postsPublished: null, followers: null, newFollowers: null });
      setEngagementOverTime([]);
      setTopPosts([]);
      setPageAccessToken(null);
      return;
    }

    if (!forceRefresh && lastFetchedPageId === fbSettings.pageId && fbPageInfo) {
      // Data already loaded for this pageId and not forcing refresh
      return;
    }

    setIsLoadingAnalytics(true);
    setAnalyticsError(null);
    let currentToken = (lastFetchedPageId === fbSettings.pageId) ? pageAccessToken : null; // Use cached token if pageId matches

    try {
      if (!currentToken || forceRefresh) { // Fetch token if not available or forcing refresh
        const managedPagesRes = await fbApi<FBManagedPagesResponse>(`/me/accounts?fields=id,name,access_token`);
        const targetPage = managedPagesRes.data.find(p => p.id === fbSettings.pageId);
        if (targetPage && targetPage.access_token) {
          setPageAccessToken(targetPage.access_token);
          currentToken = targetPage.access_token;
        } else {
          throw new Error(`Could not find Page Access Token for Page ID ${fbSettings.pageId}.`);
        }
      }

      if (!currentToken) {
        throw new Error("Page Access Token is missing.");
      }
      
      const pageInfoRes = await fbApi<FBPageInfo>(`/${fbSettings.pageId}?fields=name,fan_count,picture&access_token=${currentToken}`);
      setFbPageInfo(pageInfoRes);
      
      const insightsMetrics = 'page_impressions_unique,page_post_engagements,page_fan_adds_unique';
      const insightsRes = await fbApi<FBInsightsResponse>(
        `/${fbSettings.pageId}/insights?metric=${insightsMetrics}&period=day&date_preset=last_30d&access_token=${currentToken}`
      );
      
      let totalReach = 0;
      let totalEngagement = 0;
      let totalNewFans = 0;
      let engagementChartData: FBInsightValue[] = [];
      
      insightsRes.data.forEach(metric => {
        if (metric.name === 'page_impressions_unique') {
          totalReach = metric.values.reduce((sum, val) => sum + (typeof val.value === 'number' ? val.value : 0), 0);
        } else if (metric.name === 'page_post_engagements') {
          totalEngagement = metric.values.reduce((sum, val) => sum + (typeof val.value === 'number' ? val.value : 0), 0);
          engagementChartData = metric.values;
        } else if (metric.name === 'page_fan_adds_unique') {
          totalNewFans = metric.values.reduce((sum, val) => sum + (typeof val.value === 'number' ? val.value : 0), 0);
        }
      });
      setEngagementOverTime(engagementChartData);

      const thirtyDaysAgoForPostCount = new Date();
      thirtyDaysAgoForPostCount.setDate(thirtyDaysAgoForPostCount.getDate() - 30);
      const since = Math.floor(thirtyDaysAgoForPostCount.getTime() / 1000);
      const until = Math.floor(new Date().getTime() / 1000);
      
      const postsRes = await fbApi<FBPostsResponse>(
         `/${fbSettings.pageId}/published_posts?fields=message,created_time,permalink_url,insights.metric(post_impressions_unique),attachments{media{image},type,url,subattachments{media{image}}}&limit=5&since=${since}&until=${until}&access_token=${currentToken}`
      );
      setTopPosts(postsRes.data || []);
      
      const postCountRes = await fbApi<{summary?: {total_count: number}}>(
        `/${fbSettings.pageId}/published_posts?since=${since}&until=${until}&summary=total_count&limit=0&access_token=${currentToken}`
      );

      setKpiData({
        reach: totalReach,
        engagement: totalEngagement,
        postsPublished: postCountRes?.summary?.total_count ?? postsRes.data.length,
        followers: pageInfoRes.fan_count || 0,
        newFollowers: totalNewFans
      });
      setLastFetchedPageId(fbSettings.pageId);

    } catch (e: any) {
      console.error("Failed to fetch Facebook data in AnalyticsContext:", e);
      setAnalyticsError(e.message || "An error occurred while fetching Facebook data.");
      setPageAccessToken(null); // Clear token on error
      setLastFetchedPageId(null); // Clear last fetched page on error
      // Clear data states
      setFbPageInfo(null);
      setKpiData({ reach: null, engagement: null, postsPublished: null, followers: null, newFollowers: null });
      setEngagementOverTime([]);
      setTopPosts([]);
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [pageAccessToken, lastFetchedPageId, fbPageInfo]);

  return (
    <AnalyticsContext.Provider value={{
      fbPageInfo,
      kpiData,
      engagementOverTime,
      topPosts,
      pageAccessToken,
      isLoadingAnalytics,
      analyticsError,
      loadAnalytics,
      lastFetchedPageId
    }}>
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
