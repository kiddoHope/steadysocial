import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
} from 'react';

import {
  FacebookSettings,
  FBPageInfo,
  FBInsightValue,
  FBPost,
  FBPostsResponse,
} from '../types';

import { dbGetFacebookSettings } from '../services/settingsService';

type FBAPIFunction = <T>(
  path: string,
  method?: 'get' | 'post' | 'delete',
  params?: Record<string, any>
) => Promise<T>;

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

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(
  undefined
);

const EMPTY_KPI: KpiDataType = {
  reach: null,
  engagement: null,
  postsPublished: null,
  followers: null,
  newFollowers: null,
};

const AnalyticsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [fbPageInfo, setFbPageInfo] = useState<FBPageInfo | null>(null);
  const [pageAccessToken, setPageAccessToken] = useState<string | null>(null);

  const [kpiData, setKpiData] = useState<KpiDataType>(EMPTY_KPI);
  const [engagementOverTime, setEngagementOverTime] = useState<FBInsightValue[]>(
    []
  );
  const [topPosts, setTopPosts] = useState<FBPost[]>([]);

  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [lastFetchedPageId, setLastFetchedPageId] = useState<string | null>(
    null
  );

  const [fbSettings, setFbSettings] = useState<FacebookSettings | null>(null);
  const [isLoadingFbSettings, setIsLoadingFbSettings] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoadingFbSettings(true);

      try {
        const settings = await dbGetFacebookSettings();
        setFbSettings(settings);
      } catch (err) {
        console.error(
          'AnalyticsContext: Failed to fetch Facebook settings',
          err
        );
        setAnalyticsError(
          'Could not load Facebook configuration for analytics.'
        );
      } finally {
        setIsLoadingFbSettings(false);
      }
    };

    fetchSettings();
  }, []);

  const resetAnalyticsState = useCallback(() => {
    setFbPageInfo(null);
    setKpiData(EMPTY_KPI);
    setEngagementOverTime([]);
    setTopPosts([]);
    setPageAccessToken(null);
  }, []);

  const getPostEngagement = (post: any): number => {
    const reactions = post?.reactions?.summary?.total_count || 0;
    const comments = post?.comments?.summary?.total_count || 0;
    const shares = post?.shares?.count || 0;

    return reactions + comments + shares;
  };

  const buildEngagementChartData = (posts: any[]): FBInsightValue[] => {
    const engagementByDate: Record<string, number> = {};

    posts.forEach((post) => {
      if (!post?.created_time) return;

      const engagement = getPostEngagement(post);
      const dateKey = new Date(post.created_time).toISOString().slice(0, 10);

      if (!engagementByDate[dateKey]) {
        engagementByDate[dateKey] = 0;
      }

      engagementByDate[dateKey] += engagement;
    });

    return Object.entries(engagementByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        value,
        end_time: `${date}T00:00:00+0000`,
      }));
  };

  const loadAnalytics = useCallback(
    async (fbApi: FBAPIFunction, forceRefresh: boolean = false) => {
      if (isLoadingFbSettings) return;

      if (!fbSettings) {
        setAnalyticsError('Facebook settings not available for analytics.');
        return;
      }

      if (!fbSettings.pageId) {
        setAnalyticsError('Facebook Page ID not configured in settings.');
        resetAnalyticsState();
        return;
      }

      if (!fbSettings.accessToken) {
        setAnalyticsError(
          'Page Access Token not found. Please configure it in Settings.'
        );
        resetAnalyticsState();
        return;
      }

      if (
        !forceRefresh &&
        lastFetchedPageId === fbSettings.pageId &&
        fbPageInfo
      ) {
        return;
      }

      setIsLoadingAnalytics(true);
      setAnalyticsError(null);

      const pageId = fbSettings.pageId;
      const currentToken = fbSettings.accessToken;

      const thirtyDaysAgo = Math.floor(
        (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
      );

      try {
        setPageAccessToken(currentToken);
        setLastFetchedPageId(pageId);

        const pageInfoPromise = fbApi<FBPageInfo>(`/${pageId}`, 'get', {
          fields: [
            'id',
            'name',
            'fan_count',
            'followers_count',
            'picture.type(large)',
          ].join(','),
          access_token: currentToken,
        });

        const postsPromise = fbApi<FBPostsResponse>(
          `/${pageId}/posts`,
          'get',
          {
            fields: [
              'id',
              'message',
              'created_time',
              'permalink_url',
              'attachments{media,subattachments,type,url}',
              'reactions.summary(true).limit(0)',
              'comments.summary(true).limit(0)',
              'shares',
            ].join(','),
            limit: 100,
            since: thirtyDaysAgo,
            access_token: currentToken,
          }
        ).catch((err) => {
          console.warn('Posts analytics request failed:', err);
          return { data: [] } as FBPostsResponse;
        });

        const [pageInfoData, postsData] = await Promise.all([
          pageInfoPromise,
          postsPromise,
        ]);

        const posts = postsData.data || [];

        const totalEngagement = posts.reduce((total, post: any) => {
          return total + getPostEngagement(post);
        }, 0);

        const dailyEngagementValues = buildEngagementChartData(posts);

        const topFivePosts = [...posts]
          .sort((a: any, b: any) => getPostEngagement(b) - getPostEngagement(a))
          .slice(0, 5);

        setFbPageInfo(pageInfoData);
        setTopPosts(topFivePosts);
        setEngagementOverTime(dailyEngagementValues);

        setKpiData({
          reach: 0,
          engagement: totalEngagement,
          postsPublished: posts.length,
          followers: pageInfoData.followers_count || pageInfoData.fan_count || 0,
          newFollowers: 0,
        });
      } catch (err: any) {
        console.error('Error loading Facebook analytics:', err);

        setAnalyticsError(
          err?.message ||
            'An unknown error occurred while fetching analytics.'
        );

        resetAnalyticsState();
      } finally {
        setIsLoadingAnalytics(false);
      }
    },
    [
      fbSettings,
      fbPageInfo,
      lastFetchedPageId,
      isLoadingFbSettings,
      resetAnalyticsState,
    ]
  );

  const contextValue: AnalyticsContextType = {
    fbPageInfo,
    kpiData,
    engagementOverTime,
    topPosts,
    pageAccessToken,
    isLoadingAnalytics,
    analyticsError,
    loadAnalytics,
    lastFetchedPageId,
    isLoadingFbSettings,
  };

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export { AnalyticsProvider };

export const useAnalytics = (): AnalyticsContextType => {
  const context = useContext(AnalyticsContext);

  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }

  return context;
};