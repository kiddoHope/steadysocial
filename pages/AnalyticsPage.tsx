
import React, { useState, useEffect, useCallback } from 'react';
import Card from '../components/ui/Card';
import { APP_NAME } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { getFacebookSettings } from '../services/settingsService';
import { FacebookSettings } from '../types'; // Corrected import path
import useFacebookSDK from '../hooks/useFacebookSDK';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';

// Interfaces for Facebook API responses (simplified)
interface FBPageInfo {
  name?: string;
  fan_count?: number;
  picture?: { data: { url: string } };
}

interface FBInsightValue {
  value: number | Record<string, number>; // Value can be a number or an object for daily data
  end_time: string;
}

interface FBInsightsData {
  name: string;
  period: string;
  values: FBInsightValue[];
  title: string;
  description: string;
  id: string;
}

interface FBInsightsResponse {
  data: FBInsightsData[];
}

interface FBPost {
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
}

interface FBPostsResponse {
  data: FBPost[];
  paging?: any;
}

// KPI Card (retained from original, slightly adapted)
const KpiCard: React.FC<{ title: string; value: string | number; change?: string; period?: string; icon: string; iconBgColor?: string; isLoading?: boolean }> = 
  ({ title, value, change, period, icon, iconBgColor = "bg-primary-500", isLoading = false }) => (
  <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 min-h-[120px]">
    <div className="flex items-start justify-between">
      <div>
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</h3>
        {isLoading ? <LoadingSpinner size="sm" className="mt-2" /> : <p className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-1">{value}</p>}
        {change && !isLoading && <p className={`text-xs mt-1 ${change.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>{change}</p>}
        {period && !isLoading && <p className="text-xs text-slate-500 dark:text-slate-400">{period}</p>}
      </div>
      <div className={`p-3 rounded-full ${iconBgColor} text-white text-xl`}>
        <i className={icon}></i>
      </div>
    </div>
  </Card>
);

const AnalyticsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [fbSettings, setFbSettings] = useState<FacebookSettings | null>(null);
  const [fbPageInfo, setFbPageInfo] = useState<FBPageInfo | null>(null);
  const [kpiData, setKpiData] = useState<any>({
    reach: null, engagement: null, postsPublished: null, followers: null, newFollowers: null
  });
  const [engagementOverTime, setEngagementOverTime] = useState<FBInsightValue[]>([]);
  const [topPosts, setTopPosts] = useState<FBPost[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attemptedFetch, setAttemptedFetch] = useState(false);

  // Load Facebook settings on mount
  useEffect(() => {
    setFbSettings(getFacebookSettings());
  }, []);

  const { isSdkInitialized, fbApi, error: sdkError, FB } = useFacebookSDK(fbSettings?.appId, fbSettings?.sdkUrl);

  const fetchData = useCallback(async () => {
    if (!fbSettings?.pageId || !isSdkInitialized) {
      if (attemptedFetch) { // Only set error if we've tried and prerequisites aren't met
        setError("Facebook Page ID not configured in settings or SDK not ready.");
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setAttemptedFetch(true);

    try {
      // 1. Fetch Page Info (Name, Fan Count, Picture)
      const pageInfoRes = await fbApi<FBPageInfo>(`/${fbSettings.pageId}?fields=name,fan_count,picture`);
      setFbPageInfo(pageInfoRes);
      setKpiData((prev:any) => ({ ...prev, followers: pageInfoRes.fan_count || 0 }));

      // 2. Fetch Insights for KPIs (Reach, Engagement, New Fans) - last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sinceDate = thirtyDaysAgo.toISOString().split('T')[0];
      const untilDate = new Date().toISOString().split('T')[0];

      const insightsMetrics = 'page_impressions_unique,page_post_engagements,page_fans_adds_unique';
      const insightsRes = await fbApi<FBInsightsResponse>(
        `/${fbSettings.pageId}/insights?metric=${insightsMetrics}&period=day&since=${sinceDate}&until=${untilDate}&date_preset=last_30d`
      );
      
      let totalReach = 0;
      let totalEngagement = 0;
      let totalNewFans = 0;
      
      insightsRes.data.forEach(metric => {
        if (metric.name === 'page_impressions_unique') {
          totalReach = metric.values.reduce((sum, val) => sum + (typeof val.value === 'number' ? val.value : 0), 0);
          // For engagement over time chart, we can use page_post_engagements daily data
        } else if (metric.name === 'page_post_engagements') {
          totalEngagement = metric.values.reduce((sum, val) => sum + (typeof val.value === 'number' ? val.value : 0), 0);
          setEngagementOverTime(metric.values);
        } else if (metric.name === 'page_fans_adds_unique') {
          totalNewFans = metric.values.reduce((sum, val) => sum + (typeof val.value === 'number' ? val.value : 0), 0);
        }
      });
      setKpiData((prev:any) => ({ ...prev, reach: totalReach, engagement: totalEngagement, newFollowers: totalNewFans }));

      // 3. Fetch Posts Published in last 30 days (and count for KPI)
      // Note: The /posts edge can be slow for counting. An alternative is to fetch a few and display, not aim for exact 30-day count.
      // For simplicity, fetching latest 5 posts for "Top Posts" and using this count is an approximation.
      const postsRes = await fbApi<FBPostsResponse>(
        `/${fbSettings.pageId}/published_posts?fields=message,created_time,permalink_url,insights.metric(post_impressions_unique,post_engaged_users).period(lifetime)&limit=5`
      );
      setTopPosts(postsRes.data);
      setKpiData((prev:any) => ({ ...prev, postsPublished: postsRes.data.length })); // This is count of *latest 5*, not last 30d.
                                                                                // A more accurate count would require pagination or different query.

    } catch (e: any) {
      console.error("Failed to fetch Facebook data:", e);
      setError(e.message || "An error occurred while fetching Facebook data. Ensure Page ID is correct and you have permissions (Page Access Token might be required).");
    } finally {
      setIsLoading(false);
    }
  }, [fbSettings, isSdkInitialized, fbApi, attemptedFetch]);

  useEffect(() => {
    if (sdkError) {
      setError(`Facebook SDK Error: ${sdkError}`);
      setIsLoading(false);
    }
  }, [sdkError]);

  useEffect(() => {
    if (isSdkInitialized && fbSettings?.appId && fbSettings?.pageId && !attemptedFetch) {
        // Automatically fetch data once SDK is initialized and settings are present
        fetchData();
    } else if (!fbSettings?.appId || !fbSettings?.pageId) {
        setIsLoading(false);
        if (attemptedFetch && !error) setError("Facebook App ID or Page ID is not configured in Settings. Analytics cannot be displayed.");
    }
  }, [isSdkInitialized, fbSettings, fetchData, attemptedFetch, error]);


  const renderEngagementChart = () => {
    if (engagementOverTime.length === 0) return <p className="text-slate-500 dark:text-slate-400">No engagement data to display.</p>;
    
    const maxValue = Math.max(...engagementOverTime.map(v => typeof v.value === 'number' ? v.value : 0), 0);
    if (maxValue === 0) return <p className="text-slate-500 dark:text-slate-400">Engagement data is zero.</p>;

    const chartHeight = 150;
    const barWidth = Math.max(5, (280 / engagementOverTime.length) - 2); // 280 is chart area width

    return (
      <svg width="100%" height={chartHeight + 40} viewBox={`0 0 300 ${chartHeight + 40}`} className="max-w-full" aria-label="Engagement Over Time Chart">
        <title>Daily Engagement for the Last 30 Days</title>
        <desc>A bar chart showing daily post engagements. Each bar represents a day, and its height corresponds to the number of engagements.</desc>
        <g role="presentation">
            <line x1="20" y1={chartHeight + 5} x2="290" y2={chartHeight + 5} stroke="currentColor" strokeWidth="1"/> {/* X-axis */}
            <line x1="20" y1="5" x2="20" y2={chartHeight + 5} stroke="currentColor" strokeWidth="1"/> {/* Y-axis */}
        </g>
        
        {engagementOverTime.map((item, index) => {
          const itemValue = typeof item.value === 'number' ? item.value : 0;
          const barHeight = (itemValue / maxValue) * chartHeight;
          const x = 20 + index * (barWidth + 2); // +2 for spacing
          const y = chartHeight + 5 - barHeight;
          const date = new Date(item.end_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

          return (
            <g key={item.end_time} role="listitem" aria-label={`Date: ${date}, Engagements: ${itemValue}`}>
              <rect x={x} y={y} width={barWidth} height={barHeight} fill="#3b82f6" className="hover:opacity-75 transition-opacity">
                 <title>{`${date}: ${itemValue} engagements`}</title>
              </rect>
              {engagementOverTime.length <= 15 && ( // Show date labels if not too crowded
                <text x={x + barWidth / 2} y={chartHeight + 20} textAnchor="middle" fontSize="8" className="fill-current text-slate-600 dark:text-slate-400" aria-hidden="true">
                  {date.split('/')[1]} {/* Assuming M/D format, show day */}
                </text>
              )}
            </g>
          );
        })}
        <text x="150" y={chartHeight + 35} textAnchor="middle" fontSize="10" className="fill-current text-slate-600 dark:text-slate-400" aria-hidden="true">Date (Last 30 Days)</text>
        <text x="10" y={(chartHeight + 5)/2} textAnchor="middle" transform={`rotate(-90 10,${(chartHeight+5)/2})`} fontSize="10" className="fill-current text-slate-600 dark:text-slate-400" aria-hidden="true">Engagements</text>
      </svg>
    );
  };

  if (!fbSettings) {
    return <div className="p-4"><LoadingSpinner /> <p>Loading settings...</p></div>;
  }
  
  if (!fbSettings.appId || !fbSettings.pageId) {
    return (
      <div className="container mx-auto p-4">
        <Alert type="warning" message="Facebook App ID or Page ID is not configured. Please set them in the Settings page to view analytics." />
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div className="flex items-center mb-4 sm:mb-0">
            {fbPageInfo?.picture?.data?.url && (
                <img src={fbPageInfo.picture.data.url} alt={`${fbPageInfo.name || 'Page'} logo`} className="w-12 h-12 rounded-full mr-4 border border-slate-300 dark:border-slate-600"/>
            )}
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">
                    {isLoading && !fbPageInfo?.name ? 'Loading Page Name...' : fbPageInfo?.name || 'Facebook Page Analytics'}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Overview for the last 30 days</p>
            </div>
        </div>
        <Button onClick={fetchData} disabled={isLoading || !isSdkInitialized} isLoading={isLoading}>
            <i className="fas fa-sync-alt mr-2"></i> Refresh Data
        </Button>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-6"/>}
      {!isSdkInitialized && !sdkError && !isLoading && fbSettings.appId && fbSettings.pageId && (
         <Alert type="info" message="Facebook SDK is initializing or encountered an issue. Data fetching may be delayed or unavailable." className="mb-6"/>
      )}

      {/* KPI Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KpiCard title="Total Reach" value={kpiData.reach?.toLocaleString() ?? 'N/A'} icon="fas fa-bullseye" iconBgColor="bg-blue-500" isLoading={isLoading && kpiData.reach === null}/>
        <KpiCard title="Total Engagement" value={kpiData.engagement?.toLocaleString() ?? 'N/A'} icon="fas fa-heart" iconBgColor="bg-red-500" isLoading={isLoading && kpiData.engagement === null}/>
        <KpiCard title="Posts (Last 5)" value={kpiData.postsPublished?.toLocaleString() ?? 'N/A'} icon="fas fa-paper-plane" iconBgColor="bg-green-500" isLoading={isLoading && kpiData.postsPublished === null}/>
        <KpiCard title="Followers" value={kpiData.followers?.toLocaleString() ?? 'N/A'} change={kpiData.newFollowers !== null ? `${kpiData.newFollowers >= 0 ? '+' : ''}${kpiData.newFollowers.toLocaleString()} net new` : undefined} period="in last 30 days" icon="fas fa-users" iconBgColor="bg-purple-500" isLoading={isLoading && kpiData.followers === null}/>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 mb-8">
        <Card title="Engagement Over Time (Last 30 Days)">
          <div className="h-64 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-md flex items-center justify-center" aria-live="polite" aria-busy={isLoading && engagementOverTime.length === 0}>
            {isLoading && engagementOverTime.length === 0 ? <LoadingSpinner /> : renderEngagementChart()}
          </div>
        </Card>
      </div>

      {/* Top Performing Content Section */}
      <Card title="Latest Published Posts">
        {isLoading && topPosts.length === 0 ? (
          <div className="text-center py-8" aria-live="polite" aria-busy="true"><LoadingSpinner /> <p className="mt-2">Loading posts...</p></div>
        ) : topPosts.length > 0 ? (
          <div className="space-y-4">
            {topPosts.map(post => {
              const postImpressions = post.insights?.data.find(i => i.name === 'post_impressions_unique')?.values[0]?.value || 0;
              const postEngagements = post.insights?.data.find(i => i.name === 'post_engaged_users')?.values[0]?.value || 0;
              return (
              <div key={post.id} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-2 truncate" title={post.message}>{post.message || "No message content."}</p>
                <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-2">
                  <span>Published: {new Date(post.created_time).toLocaleDateString()}</span>
                  {post.permalink_url && <a href={post.permalink_url} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">View on Facebook <i className="fas fa-external-link-alt text-xs ml-1"></i></a>}
                </div>
                <div className="flex space-x-4">
                    <p className="text-sm"><i className="fas fa-eye mr-1 text-blue-500"></i> Impressions: <span className="font-semibold">{postImpressions.toLocaleString()}</span></p>
                    <p className="text-sm"><i className="fas fa-users mr-1 text-green-500"></i> Engaged Users: <span className="font-semibold">{postEngagements.toLocaleString()}</span></p>
                </div>
              </div>
            )})}
          </div>
        ) : (
          <p className="text-center text-slate-500 dark:text-slate-400 py-8">No posts found or unable to fetch posts.</p>
        )}
      </Card>
      
      <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-12">
        Note: Facebook analytics may require a valid Page Access Token for full data access.
        If data is missing or errors occur, ensure your Page ID is correct and the necessary permissions are granted to the App ID.
        This demonstration ({APP_NAME}) does not handle the full OAuth flow for obtaining Page Access Tokens.
      </p>
    </div>
  );
};

export default AnalyticsPage;
