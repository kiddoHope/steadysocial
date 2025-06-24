
import React, { useState, useEffect, useCallback } from 'react';
import Card from '../components/ui/Card';
import { APP_NAME } from '../constants';
// import { useAuth } from '../contexts/AuthContext'; // currentUser not directly used here anymore
import { getFacebookSettings } from '../services/settingsService';
import { FacebookSettings, FacebookPage } from '../types'; // Keep for fbSettings type
import useFacebookSDK from '../hooks/useFacebookSDK';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import { useAnalytics, FBPageInfo, FBInsightValue, FBPost } from '../contexts/AnalyticsContext'; // Import context and types

// Interfaces like FBPageInfo, FBInsightValue, FBPost, etc., are now sourced from AnalyticsContext

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
  const [fbSettings, setFbSettings] = useState<FacebookSettings | null>(null);
  
  // Use AnalyticsContext for data, loading, and error states
  const {
    fbPageInfo,
    kpiData,
    engagementOverTime,
    topPosts,
    isLoadingAnalytics,
    analyticsError,
    loadAnalytics,
    // pageAccessToken, // Not directly used in UI, managed by context
    // lastFetchedPageId // Not directly used in UI, managed by context
  } = useAnalytics();

  const [localError, setLocalError] = useState<string | null>(null); // For SDK errors or initial setup errors

  useEffect(() => {
    setFbSettings(getFacebookSettings());
  }, []);

  const { isSdkInitialized, fbApi, error: sdkError } = useFacebookSDK(fbSettings?.appId, fbSettings?.sdkUrl);

  useEffect(() => {
    if (sdkError) {
      setLocalError(`Facebook SDK Error: ${sdkError}`);
    } else {
      setLocalError(null); // Clear local error if SDK initializes successfully later
    }
  }, [sdkError]);

  useEffect(() => {
    if (isSdkInitialized && fbSettings && fbApi) {
      if (fbSettings.appId && fbSettings.pageId) {
        loadAnalytics(fbSettings, fbApi);
      } else {
        setLocalError("Facebook App ID or Page ID is not configured in Settings. Analytics cannot be displayed.");
      }
    }
  }, [isSdkInitialized, fbSettings, fbApi, loadAnalytics]);


  const handleRefreshData = () => {
    if (fbSettings && fbApi && isSdkInitialized) {
      loadAnalytics(fbSettings, fbApi, true); // Force refresh
    } else {
      setLocalError("Cannot refresh: SDK not ready or settings missing.");
    }
  };

  const renderEngagementChart = () => {
    if (engagementOverTime.length === 0) return <p className="text-slate-500 dark:text-slate-400">No engagement data to display.</p>;
    
    const maxValue = Math.max(...engagementOverTime.map(v => typeof v.value === 'number' ? v.value : 0), 0);
    
    const svgWidth = 320; 
    const svgHeight = 200;
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };
    const chartWidth = svgWidth - margin.left - margin.right;
    const chartHeight = svgHeight - margin.top - margin.bottom;

    if (maxValue === 0) return <p className="text-slate-500 dark:text-slate-400">Engagement data is zero for the selected period.</p>;

    const barPadding = 0.2;
    const barWidth = chartWidth / engagementOverTime.length * (1 - barPadding);
    const barSpacing = chartWidth / engagementOverTime.length * barPadding;

    const numYTicks = 4;
    const yTickValues = Array.from({ length: numYTicks + 1 }, (_, i) => (maxValue / numYTicks) * i);
    
    // Filter x-axis labels to prevent overlap
    const maxXTicks = Math.floor(chartWidth / 40); // Max labels based on available width (e.g., 40px per label)
    const xTickStep = Math.max(1, Math.ceil(engagementOverTime.length / maxXTicks));


    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="max-w-full" aria-label="Engagement Over Time Chart">
        <title>Daily Engagement for the Last 30 Days</title>
        <desc>A bar chart showing daily post engagements. Each bar represents a day, and its height corresponds to the number of engagements.</desc>
        
        {/* Y-axis and Grid Lines */}
        <g transform={`translate(${margin.left}, ${margin.top})`} role="presentation">
          {yTickValues.map((tickValue, i) => {
            const y = chartHeight - (tickValue / maxValue) * chartHeight;
            return (
              <g key={`y-tick-${i}`}>
                <line
                  x1={0}
                  y1={y}
                  x2={chartWidth}
                  y2={y}
                  className="stroke-slate-200 dark:stroke-slate-700"
                  strokeWidth="0.5"
                  strokeDasharray={tickValue === 0 ? "0" : "2,2"} // Solid line for base
                />
                <text
                  x={-5}
                  y={y + 3} // Adjust for vertical alignment
                  textAnchor="end"
                  fontSize="8"
                  className="fill-current text-slate-500 dark:text-slate-400"
                  aria-hidden="true"
                >
                  {tickValue.toLocaleString()}
                </text>
              </g>
            );
          })}
          {/* Y-axis line */}
           <line x1="0" y1="0" x2="0" y2={chartHeight} className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="1"/>
        </g>

        {/* X-axis */}
        <g transform={`translate(${margin.left}, ${margin.top + chartHeight})`} role="presentation">
            <line x1="0" y1="0" x2={chartWidth} y2="0" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="1"/>
            {engagementOverTime.map((item, index) => {
                 if (index % xTickStep !== 0 && index !== engagementOverTime.length -1 && engagementOverTime.length > maxXTicks) return null; // Reduce density of labels

                 const date = new Date(item.end_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                 const xPos = index * (barWidth + barSpacing) + (barWidth / 2) + (barSpacing / 2);
                 return (
                    <text 
                        key={`x-label-${index}`}
                        x={xPos} 
                        y={15} // Position below axis line
                        textAnchor="middle" 
                        fontSize="8" 
                        className="fill-current text-slate-500 dark:text-slate-400"
                        aria-hidden="true"
                    >
                      {date.split('/')[1] || date.split(' ')[0]} {/* Day number */}
                    </text>
                 );
            })}
        </g>
        
        {/* Bars */}
        <g transform={`translate(${margin.left}, ${margin.top})`} role="list">
          {engagementOverTime.map((item, index) => {
            const itemValue = typeof item.value === 'number' ? item.value : 0;
            const barActualHeight = (itemValue / maxValue) * chartHeight;
            const x = index * (barWidth + barSpacing) + (barSpacing / 2);
            const y = chartHeight - barActualHeight;
            const dateLabel = new Date(item.end_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric'});

            return (
              <rect
                key={item.end_time}
                x={x}
                y={y}
                width={barWidth}
                height={barActualHeight}
                className="fill-primary-500 hover:fill-primary-600 dark:fill-primary-600 dark:hover:fill-primary-500 transition-colors"
                role="listitem"
                aria-label={`Date: ${dateLabel}, Engagements: ${itemValue.toLocaleString()}`}
              >
                <title>{`${dateLabel}: ${itemValue.toLocaleString()} engagements`}</title>
              </rect>
            );
          })}
        </g>

         {/* Axis Labels Text */}
        <text 
            transform={`translate(${margin.left / 3}, ${margin.top + chartHeight / 2}) rotate(-90)`} 
            textAnchor="middle" 
            fontSize="10" 
            className="fill-current text-slate-600 dark:text-slate-300 font-medium"
            aria-hidden="true"
        >
            Engagements
        </text>
        <text 
            transform={`translate(${margin.left + chartWidth / 2}, ${svgHeight - margin.bottom / 2.5})`}
            textAnchor="middle" 
            fontSize="10" 
            className="fill-current text-slate-600 dark:text-slate-300 font-medium"
            aria-hidden="true"
        >
            Date (Last 30 Days)
        </text>
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

  const displayError = analyticsError || localError;

  return (
    <div className="container mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div className="flex items-center mb-4 sm:mb-0">
            {fbPageInfo?.picture?.data?.url && (
                <img src={fbPageInfo.picture.data.url} alt={`${fbPageInfo.name || 'Page'} logo`} className="w-12 h-12 rounded-full mr-4 border border-slate-300 dark:border-slate-600"/>
            )}
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">
                    {isLoadingAnalytics && !fbPageInfo?.name ? 'Loading Page Name...' : fbPageInfo?.name || 'Facebook Page Analytics'}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Overview for the last 30 days</p>
            </div>
        </div>
        <Button onClick={handleRefreshData} disabled={isLoadingAnalytics || !isSdkInitialized} isLoading={isLoadingAnalytics}>
            <i className="fas fa-sync-alt mr-2"></i> Refresh Data
        </Button>
      </div>

      {displayError && <Alert type="error" message={displayError} onClose={() => { setLocalError(null); /* context error cleared by context */ }} className="mb-6"/>}
      {!isSdkInitialized && !sdkError && !isLoadingAnalytics && fbSettings.appId && fbSettings.pageId && (
         <Alert type="info" message="Facebook SDK is initializing or encountered an issue. Data fetching may be delayed or unavailable." className="mb-6"/>
      )}

      {/* KPI Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KpiCard title="Total Reach" value={kpiData.reach?.toLocaleString() ?? 'N/A'} icon="fas fa-bullseye" iconBgColor="bg-blue-500" isLoading={isLoadingAnalytics && kpiData.reach === null}/>
        <KpiCard title="Total Engagement" value={kpiData.engagement?.toLocaleString() ?? 'N/A'} icon="fas fa-heart" iconBgColor="bg-red-500" isLoading={isLoadingAnalytics && kpiData.engagement === null}/>
        <KpiCard title="Posts Published" value={kpiData.postsPublished?.toLocaleString() ?? 'N/A'} period="in last 30 days" icon="fas fa-paper-plane" iconBgColor="bg-green-500" isLoading={isLoadingAnalytics && kpiData.postsPublished === null}/>
        <KpiCard title="Followers" value={kpiData.followers?.toLocaleString() ?? 'N/A'} change={kpiData.newFollowers !== null ? `${kpiData.newFollowers >= 0 ? '+' : ''}${kpiData.newFollowers.toLocaleString()} net new` : undefined} period="in last 30 days" icon="fas fa-users" iconBgColor="bg-purple-500" isLoading={isLoadingAnalytics && kpiData.followers === null}/>
      </div>

      {/* Main content area: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Column 1: Engagement Chart */}
        <Card title="Engagement Over Time (Last 30 Days)">
          <div className="h-auto w-full p-2 sm:p-4 bg-slate-50 dark:bg-slate-700/50 rounded-md flex items-center justify-center" aria-live="polite" aria-busy={isLoadingAnalytics && engagementOverTime.length === 0}>
            {isLoadingAnalytics && engagementOverTime.length === 0 ? <LoadingSpinner /> : renderEngagementChart()}
          </div>
        </Card>

        {/* Column 2: Top Performing Content Section */}
        <Card title="Latest Published Posts (Last 5)">
          {isLoadingAnalytics && topPosts.length === 0 ? (
            <div className="text-center py-8" aria-live="polite" aria-busy="true"><LoadingSpinner /> <p className="mt-2">Loading posts...</p></div>
          ) : topPosts.length > 0 ? (
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2"> {/* Added max-height and overflow for scroll */}
              {topPosts.map(post => {
                const postImpressions = post.insights?.data.find(i => i.name === 'post_impressions_unique')?.values[0]?.value || 0;
                let postImageUrl: string | null = null;
                if (post.attachments && post.attachments.data && post.attachments.data.length > 0) {
                    const attachment = post.attachments.data[0];
                    if (attachment.type === 'photo' && attachment.media?.image?.src) {
                        postImageUrl = attachment.media.image.src;
                    } else if (attachment.type === 'album' && attachment.subattachments?.data && attachment.subattachments.data.length > 0) {
                        postImageUrl = attachment.subattachments.data[0].media?.image?.src || null;
                    } else if (attachment.type === 'video' && attachment.media?.image?.src) { // For video thumbnail
                        postImageUrl = attachment.media.image.src;
                    }
                }

                return (
                <div key={post.id} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                  {postImageUrl && (
                    <img 
                        src={postImageUrl} 
                        alt="Post media" 
                        className="w-full h-auto max-h-48 object-cover rounded-md mb-3 border border-slate-200 dark:border-slate-600"
                    />
                  )}
                  <p className="text-sm text-slate-700 dark:text-slate-300 mb-2 truncate" title={post.message}>{post.message || "No message content."}</p>
                  <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>Published: {new Date(post.created_time).toLocaleDateString()}</span>
                    {post.permalink_url && <a href={post.permalink_url} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">View on Facebook <i className="fas fa-external-link-alt text-xs ml-1"></i></a>}
                  </div>
                  <div className="flex space-x-4">
                      <p className="text-sm"><i className="fas fa-eye mr-1 text-blue-500"></i> Impressions: <span className="font-semibold">{postImpressions.toLocaleString()}</span></p>
                      <p className="text-sm"><i className="fas fa-users mr-1 text-green-500"></i> Engaged Users: <span className="font-semibold">N/A</span></p>
                  </div>
                </div>
              )})}
            </div>
          ) : (
            <p className="text-center text-slate-500 dark:text-slate-400 py-8">No posts found or unable to fetch posts.</p>
          )}
        </Card>
      </div>
      
      <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-12">
        Note: Facebook analytics may require a valid Page Access Token for full data access.
        If data is missing or errors occur, ensure your Page ID is correct and the necessary permissions are granted to the App ID by the logged-in Facebook user.
        This demonstration ({APP_NAME}) utilizes User Access Tokens to obtain Page Access Tokens for specific operations.
      </p>
    </div>
  );
};

export default AnalyticsPage;
