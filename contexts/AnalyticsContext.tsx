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
import {
  ConfiguredFacebookPage,
  MultiPageFacebookSettings,
  getDefaultFacebookPage,
  getFacebookPageAccessToken,
  normalizeFacebookPages,
} from '../utils/facebookPageUtils';

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

type AnalyticsPageTarget = Partial<ConfiguredFacebookPage> & {
  id?: string;
  pageId?: string;
  name?: string;
  pageName?: string;
  access_token?: string;
  accessToken?: string;
};

interface AnalyticsContextType {
  fbPageInfo: FBPageInfo | null;
  kpiData: KpiDataType;
  engagementOverTime: FBInsightValue[];
  topPosts: FBPost[];
  pageAccessToken: string | null;
  activeAnalyticsPage: AnalyticsPageTarget | null;
  setAnalyticsPage: (page: AnalyticsPageTarget | null) => void;
  isLoadingAnalytics: boolean;
  analyticsError: string | null;
  loadAnalytics: (
    fbApi: FBAPIFunction,
    forceRefresh?: boolean,
    pageOverride?: AnalyticsPageTarget | null
  ) => Promise<void>;
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

const normalizeId = (value?: string | null): string => String(value || '').trim();

const getTargetPageId = (page?: AnalyticsPageTarget | null): string => {
  return normalizeId(page?.id || page?.pageId || '');
};

const getTargetPageName = (page?: AnalyticsPageTarget | null): string => {
  return normalizeId(page?.name || page?.pageName || '');
};

const AnalyticsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [fbPageInfo, setFbPageInfo] = useState<FBPageInfo | null>(null);
  const [pageAccessToken, setPageAccessToken] = useState<string | null>(null);
  const [activeAnalyticsPage, setActiveAnalyticsPage] = useState<AnalyticsPageTarget | null>(null);

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

  const [fbSettings, setFbSettings] = useState<MultiPageFacebookSettings | null>(null);
  const [isLoadingFbSettings, setIsLoadingFbSettings] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoadingFbSettings(true);

      try {
        const settings = (await dbGetFacebookSettings()) as MultiPageFacebookSettings;
        const pages = normalizeFacebookPages(settings);
        const defaultPage = getDefaultFacebookPage(pages, settings);

        setFbSettings(settings);
        setActiveAnalyticsPage(prev => prev || defaultPage || null);
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

  const setAnalyticsPage = useCallback((page: AnalyticsPageTarget | null) => {
    setActiveAnalyticsPage(page);
    setLastFetchedPageId(null);
    resetAnalyticsState();
  }, [resetAnalyticsState]);

  const resolveTargetPage = useCallback((pageOverride?: AnalyticsPageTarget | null) => {
    const configuredPages = normalizeFacebookPages(fbSettings);
    const fallbackPage = getDefaultFacebookPage(configuredPages, fbSettings);
    const target = pageOverride || activeAnalyticsPage || fallbackPage;

    const pageId =
      getTargetPageId(target) ||
      normalizeId(fbSettings?.pageId || '');

    const accessToken =
      getFacebookPageAccessToken(target as ConfiguredFacebookPage) ||
      normalizeId(fbSettings?.accessToken || '');

    const pageName =
      getTargetPageName(target) ||
      normalizeId(fbSettings?.pageName || '');

    return {
      pageId,
      accessToken,
      pageName,
      page: target || null,
    };
  }, [activeAnalyticsPage, fbSettings]);

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
    async (
      fbApi: FBAPIFunction,
      forceRefresh: boolean = false,
      pageOverride?: AnalyticsPageTarget | null
    ) => {
      if (isLoadingFbSettings && !pageOverride && !activeAnalyticsPage) return;

      const { pageId, accessToken, page } = resolveTargetPage(pageOverride);

      if (!pageId) {
        setAnalyticsError('Facebook Page ID not configured in settings.');
        resetAnalyticsState();
        return;
      }

      if (!accessToken) {
        setAnalyticsError(
          'Page Access Token not found. Please configure it in Settings.'
        );
        resetAnalyticsState();
        return;
      }

      if (
        !forceRefresh &&
        lastFetchedPageId === pageId &&
        fbPageInfo
      ) {
        return;
      }

      setIsLoadingAnalytics(true);
      setAnalyticsError(null);

      const thirtyDaysAgo = Math.floor(
        (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
      );

      try {
        setActiveAnalyticsPage(page || pageOverride || null);
        setPageAccessToken(accessToken);
        setLastFetchedPageId(pageId);

        const pageInfoPromise = fbApi<FBPageInfo>(`/${pageId}`, 'get', {
          fields: [
            'id',
            'name',
            'fan_count',
            'followers_count',
            'picture.type(large)',
          ].join(','),
          access_token: accessToken,
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
            access_token: accessToken,
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
      activeAnalyticsPage,
      fbPageInfo,
      lastFetchedPageId,
      isLoadingFbSettings,
      resolveTargetPage,
      resetAnalyticsState,
    ]
  );

  const contextValue: AnalyticsContextType = {
    fbPageInfo,
    kpiData,
    engagementOverTime,
    topPosts,
    pageAccessToken,
    activeAnalyticsPage,
    setAnalyticsPage,
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
