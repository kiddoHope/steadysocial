import React, { useState, useEffect } from 'react';

import Card from '../components/ui/Card';
import { dbGetFacebookSettings } from '../services/settingsService';
import { FacebookSettings, CanvasStatus } from '../types';
import useFacebookSDK from '../hooks/useFacebookSDK';
import {
  ConfiguredFacebookPage,
  MultiPageFacebookSettings,
  getDefaultFacebookPage,
  getFacebookPageAccessToken,
  normalizeFacebookPages,
} from '../utils/facebookPageUtils';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import { useAnalytics } from '../contexts/AnalyticsContext';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { dbGetSchedulerHistory } from '../services/campaignService';
import { dbFetchCanvases } from '../services/canvasService';
import { getPlanningFiles } from '../services/planningService';
import { dbGetLeads } from '../services/crmService';
import { chatDbService } from '../services/chatDbService';

export type AnalyticsTab = 'FACEBOOK' | 'SCHEDULER' | 'GENERATIONS' | 'PLANS' | 'LEADS' | 'MESSAGES';

const KpiCard: React.FC<{
  title: string;
  value: string | number;
  change?: string;
  period?: string;
  icon: string;
  iconBgColor?: string;
  isLoading?: boolean;
}> = ({
  title,
  value,
  change,
  period,
  icon,
  iconBgColor = 'bg-neo-black',
  isLoading = false,
}) => (
  <Card className="!p-6 neo-shadow-md hover:neo-shadow-lg transition-all relative overflow-hidden group">
    <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

    <div className="flex items-start justify-between relative z-10">
      <div>
        <h3 className="text-[10px] font-black text-neo-black uppercase tracking-[0.2em] mb-2">
          {title}
        </h3>

        {isLoading ? (
          <div className="w-16 h-8 bg-neo-muted animate-pulse neo-border-sm"></div>
        ) : (
          <p className="text-4xl font-black text-neo-black leading-none tracking-tighter">
            {value}
          </p>
        )}

        {change && !isLoading && (
          <div
            className={`inline-block mt-3 px-2 py-0.5 neo-border-sm text-[10px] font-black uppercase rotate-1 ${
              change.startsWith('+')
                ? 'bg-neo-secondary text-neo-black'
                : 'bg-neo-accent text-white'
            }`}
          >
            {change}
          </div>
        )}

        {period && !isLoading && (
          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-neo-black/40">
            {period}
          </p>
        )}
      </div>

      <div
        className={`w-12 h-12 neo-border flex items-center justify-center ${iconBgColor} text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] group-hover:translate-x-[2px] group-hover:translate-y-[2px] group-hover:shadow-none transition-all`}
      >
        <i className={icon}></i>
      </div>
    </div>
  </Card>
);

const AnalyticsPage: React.FC = () => {
  const [fbSettings, setFbSettings] = useState<MultiPageFacebookSettings | null>(null);
  const [isLoadingFbSettings, setIsLoadingFbSettings] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [localPageError, setLocalPageError] = useState<string | null>(null);
  const [fbPages, setFbPages] = useState<ConfiguredFacebookPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<ConfiguredFacebookPage | null>(null);

  const [activeTab, setActiveTab] = useState<AnalyticsTab>('FACEBOOK');

  // Scheduler data
  const [schedulerTotal, setSchedulerTotal] = useState(0);
  const [schedulerPending, setSchedulerPending] = useState(0);

  // Canvases data
  const [canvasesTotal, setCanvasesTotal] = useState(0);
  const [canvasesDraft, setCanvasesDraft] = useState(0);
  const [canvasesReady, setCanvasesReady] = useState(0);

  // Planning data
  const [planningFilesTotal, setPlanningFilesTotal] = useState(0);

  // Leads data
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsNew, setLeadsNew] = useState(0);
  const [leadsConverted, setLeadsConverted] = useState(0);

  // Messages data
  const [messagesTotal, setMessagesTotal] = useState(0);

  const {
    fbPageInfo,
    kpiData,
    engagementOverTime,
    topPosts,
    isLoadingAnalytics,
    analyticsError: contextError,
    loadAnalytics,
    setAnalyticsPage,
  } = useAnalytics();

  useEffect(() => {
    const loadSettings = async () => {
      setIsLoadingFbSettings(true);
      setLocalPageError(null);

      try {
        const settings = (await dbGetFacebookSettings()) as MultiPageFacebookSettings;
        const pages = normalizeFacebookPages(settings);
        const defaultPage = getDefaultFacebookPage(pages, settings);

        setFbSettings(settings);
        setFbPages(pages);
        setSelectedPage(defaultPage);

        if (!settings.appId) {
          setLocalPageError(
            'Facebook App ID is not configured. Please set it in Settings.'
          );
          return;
        }

        if (pages.length === 0 || !defaultPage) {
          setLocalPageError(
            'No Facebook pages are configured. Add pages in Settings first.'
          );
          return;
        }

        if (!getFacebookPageAccessToken(defaultPage)) {
          setLocalPageError(
            'The selected Facebook Page Access Token is not configured.'
          );
          return;
        }
      } catch (err) {
        console.error('Failed to load FB settings for Analytics:', err);
        setLocalPageError('Could not load Facebook settings.');
      } finally {
        setIsLoadingFbSettings(false);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    const fetchOtherData = async () => {
      try {
        // Scheduler
        const history = await dbGetSchedulerHistory();
        const pageScopedHistory = selectedPage
          ? history.filter((h: any) =>
              h.pageId === selectedPage.id ||
              h.page === selectedPage.name ||
              h.page === selectedPage.id
            )
          : history;
        setSchedulerTotal(pageScopedHistory.length);
        const now = Date.now();
        const pendingCount = pageScopedHistory.filter(h => new Date(h.time).getTime() > now).length;
        setSchedulerPending(pendingCount);

        // Canvases
        const canvases = await (dbFetchCanvases as any)(selectedPage?.id);
        setCanvasesTotal(canvases.length);
        setCanvasesDraft(canvases.filter(c => c.status === CanvasStatus.DRAFT).length);
        setCanvasesReady(canvases.filter(c => c.status === CanvasStatus.APPROVED || c.status === CanvasStatus.PENDING_REVIEW).length);

        // Planning
        const planningRes = await getPlanningFiles();
        let fileCount = 0;
        const countFiles = (items: any[]) => {
          items.forEach(item => {
            if (item.type === 'file') fileCount++;
            if (item.children) countFiles(item.children);
          });
        };
        if (planningRes.length) countFiles(planningRes);
        setPlanningFilesTotal(fileCount);

        // Leads
        const leads = await dbGetLeads();
        const pageScopedLeads = selectedPage
          ? leads.filter((l: any) =>
              !l.facebookPageId ||
              l.facebookPageId === selectedPage.id ||
              l.facebookPageName === selectedPage.name
            )
          : leads;
        setLeadsTotal(pageScopedLeads.length);
        setLeadsNew(pageScopedLeads.filter(l => l.status === 'NEW').length);
        setLeadsConverted(pageScopedLeads.filter(l => l.status === 'WON' || l.status === 'QUALIFIED').length);

        // Messages
        const states = await chatDbService.getAllConversationStates(selectedPage?.id);
        setMessagesTotal(Object.keys(states).length);

      } catch (e) {
        console.error("Failed to fetch auxiliary analytics data", e);
      }
    };

    fetchOtherData();
  }, [selectedPage?.id, selectedPage?.name]);

  const selectedPageAccessToken = getFacebookPageAccessToken(selectedPage);

  const { fbApi, error: sdkError } = useFacebookSDK(
    fbSettings?.appId,
    undefined,
    selectedPageAccessToken || fbSettings?.accessToken
  );

  const pageScopedFbApi = React.useCallback(
    async <T,>(
      path: string,
      method: 'get' | 'post' | 'delete' = 'get',
      params: Record<string, any> = {}
    ): Promise<T> => {
      if (!selectedPage || !fbApi) {
        throw new Error('No Facebook page selected.');
      }

      const legacyPageId = fbSettings?.pageId;
      let scopedPath = path;

      if (legacyPageId && scopedPath === `/${legacyPageId}`) {
        scopedPath = `/${selectedPage.id}`;
      } else if (legacyPageId && scopedPath.startsWith(`/${legacyPageId}/`)) {
        scopedPath = `/${selectedPage.id}${scopedPath.slice(legacyPageId.length + 1)}`;
      } else if (scopedPath === '/me') {
        scopedPath = `/${selectedPage.id}`;
      }

      return fbApi<T>(scopedPath, method, {
        ...params,
        access_token: selectedPage.access_token,
      });
    },
    [fbApi, fbSettings?.pageId, selectedPage]
  );

  useEffect(() => {
    setAnalyticsPage(selectedPage);
  }, [selectedPage?.id, selectedPage?.name, selectedPageAccessToken, setAnalyticsPage]);

  useEffect(() => {
    setIsLoggedIn(Boolean(selectedPage?.id && selectedPageAccessToken));
  }, [selectedPage?.id, selectedPageAccessToken]);

  useEffect(() => {
    if (sdkError) {
      setLocalPageError(`Facebook API Error: ${sdkError}`);
      return;
    }

    if (
      isLoggedIn &&
      fbSettings &&
      pageScopedFbApi &&
      fbSettings.appId &&
      selectedPage?.id &&
      selectedPageAccessToken
    ) {
      setLocalPageError(null);
      loadAnalytics(pageScopedFbApi, false, selectedPage);
    }
  }, [isLoggedIn, fbSettings, pageScopedFbApi, loadAnalytics, sdkError, selectedPage?.id, selectedPageAccessToken]);

  const handleRefreshData = () => {
    if (
      fbSettings &&
      pageScopedFbApi &&
      fbSettings.appId &&
      selectedPage?.id &&
      selectedPageAccessToken
    ) {
      setLocalPageError(null);
      loadAnalytics(pageScopedFbApi, true, selectedPage);
    } else {
      setLocalPageError(
        'Cannot refresh: Facebook settings or access token is missing.'
      );
    }
  };

  const handleExportPDF = async () => {
    setLocalPageError(null);
    alert('GENERATING ANALYTICS PDF PAYLOAD...');

    try {
      const dashboardElement = document.querySelector('main') as HTMLElement;
      if (!dashboardElement) {
        throw new Error('Dashboard element not found');
      }

      const canvas = await html2canvas(dashboardElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f4f4f5',
      });

      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `SteadySocial_Analytics_${fbPageInfo?.name || 'Dashboard'}.pdf`;
      pdf.save(filename);
    } catch (err: any) {
      console.error('Failed to export PDF:', err);
      setLocalPageError(`PDF Export Failed: ${err.message}`);
    }
  };

  const formatNumber = (value: number | null | undefined, fallback = '0') => {
    if (value === null || value === undefined) return fallback;
    return value.toLocaleString();
  };

  const getPostEngagement = (post: any): number => {
    const reactions = post?.reactions?.summary?.total_count || 0;
    const comments = post?.comments?.summary?.total_count || 0;
    const shares = post?.shares?.count || 0;

    return reactions + comments + shares;
  };

  const getPostImageUrl = (post: any): string | null => {
    const attachment = post?.attachments?.data?.[0];

    if (!attachment) return null;

    return (
      attachment?.media?.image?.src ||
      attachment?.subattachments?.data?.[0]?.media?.image?.src ||
      null
    );
  };

  const renderEngagementChart = () => {
    if (isLoadingAnalytics && engagementOverTime.length === 0) {
      return (
        <div className="flex justify-center items-center h-full">
          <LoadingSpinner />
        </div>
      );
    }

    if (engagementOverTime.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center text-white/60">
          <i className="fas fa-chart-bar text-5xl mb-4 opacity-30"></i>
          <p className="text-xs font-black uppercase tracking-[0.2em]">
            No engagement data to display
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-60">
            Publish posts or sync again later
          </p>
        </div>
      );
    }

    const maxValue = Math.max(
      ...engagementOverTime.map((v) =>
        typeof v.value === 'number' ? v.value : 0
      ),
      0
    );

    if (maxValue === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center text-white/60">
          <i className="fas fa-heart-crack text-5xl mb-4 opacity-30"></i>
          <p className="text-xs font-black uppercase tracking-[0.2em]">
            Engagement is zero
          </p>
        </div>
      );
    }

    const svgWidth = 320;
    const svgHeight = 200;
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };
    const chartWidth = svgWidth - margin.left - margin.right;
    const chartHeight = svgHeight - margin.top - margin.bottom;

    const barPadding = 0.2;
    const slotWidth = chartWidth / engagementOverTime.length;
    const barWidth = slotWidth * (1 - barPadding);
    const barSpacing = slotWidth * barPadding;

    const numYTicks = 4;
    const yTickValues = Array.from(
      { length: numYTicks + 1 },
      (_, i) => (maxValue / numYTicks) * i
    );

    const maxXTicks = Math.floor(chartWidth / 40);
    const xTickStep = Math.max(
      1,
      Math.ceil(engagementOverTime.length / maxXTicks)
    );

    return (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="max-w-full"
        aria-label="Engagement Over Time Chart"
      >
        <title>Daily Engagement for the Last 30 Days</title>
        <desc>
          A bar chart showing daily engagement. Engagement is calculated from
          reactions, comments, and shares.
        </desc>

        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {yTickValues.map((tickValue, i) => {
            const y =
              chartHeight -
              (maxValue > 0 ? (tickValue / maxValue) * chartHeight : 0);

            return (
              <g key={`y-tick-${i}`}>
                <line
                  x1={0}
                  y1={y}
                  x2={chartWidth}
                  y2={y}
                  className="stroke-white/20"
                  strokeWidth="0.5"
                  strokeDasharray={tickValue === 0 ? '0' : '2,2'}
                />

                <text
                  x={-5}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="8"
                  className="fill-white/60"
                  aria-hidden="true"
                >
                  {Math.round(tickValue).toLocaleString()}
                </text>
              </g>
            );
          })}

          <line
            x1="0"
            y1="0"
            x2="0"
            y2={chartHeight}
            className="stroke-white/40"
            strokeWidth="1"
          />
        </g>

        <g transform={`translate(${margin.left}, ${margin.top + chartHeight})`}>
          <line
            x1="0"
            y1="0"
            x2={chartWidth}
            y2="0"
            className="stroke-white/40"
            strokeWidth="1"
          />

          {engagementOverTime.map((item, index) => {
            if (
              index % xTickStep !== 0 &&
              index !== engagementOverTime.length - 1 &&
              engagementOverTime.length > maxXTicks
            ) {
              return null;
            }

            const date = new Date(item.end_time).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });

            const xPos =
              index * (barWidth + barSpacing) +
              barWidth / 2 +
              barSpacing / 2;

            return (
              <text
                key={`x-label-${index}`}
                x={xPos}
                y={15}
                textAnchor="middle"
                fontSize="8"
                className="fill-white/60"
                aria-hidden="true"
              >
                {date}
              </text>
            );
          })}
        </g>

        <g transform={`translate(${margin.left}, ${margin.top})`} role="list">
          {engagementOverTime.map((item, index) => {
            const itemValue = typeof item.value === 'number' ? item.value : 0;

            const barActualHeight =
              maxValue > 0 ? (itemValue / maxValue) * chartHeight : 0;

            const x = index * (barWidth + barSpacing) + barSpacing / 2;
            const y = chartHeight - barActualHeight;

            const dateLabel = new Date(item.end_time).toLocaleDateString(
              undefined,
              {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }
            );

            return (
              <rect
                key={`${item.end_time}-${index}`}
                x={x}
                y={y}
                width={barWidth}
                height={barActualHeight}
                className="fill-white hover:fill-neo-secondary transition-colors"
                role="listitem"
                aria-label={`Date: ${dateLabel}, Engagement: ${itemValue.toLocaleString()}`}
              >
                <title>
                  {`${dateLabel}: ${itemValue.toLocaleString()} engagements`}
                </title>
              </rect>
            );
          })}
        </g>

        <text
          transform={`translate(${margin.left / 3}, ${
            margin.top + chartHeight / 2
          }) rotate(-90)`}
          textAnchor="middle"
          fontSize="10"
          className="fill-white/70 font-medium"
          aria-hidden="true"
        >
          Engagement
        </text>

        <text
          transform={`translate(${margin.left + chartWidth / 2}, ${
            svgHeight - margin.bottom / 2.5
          })`}
          textAnchor="middle"
          fontSize="10"
          className="fill-white/70 font-medium"
          aria-hidden="true"
        >
          Date
        </text>
      </svg>
    );
  };

  if (isLoadingFbSettings) {
    return (
      <div className="p-4 flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
        <p className="ml-3">Loading settings...</p>
      </div>
    );
  }

  const displayError = contextError || localPageError;

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-6">
          {fbPageInfo?.picture?.data?.url && (
            <div className="relative">
              <div className="absolute inset-0 neo-border bg-neo-black translate-x-1 translate-y-1"></div>
              <img
                src={fbPageInfo.picture.data.url}
                alt="Facebook Page"
                className="relative w-20 h-20 neo-border object-cover bg-white"
              />
            </div>
          )}

          <div>
            <div className="inline-block bg-neo-secondary text-neo-black px-2 py-0.5 mb-2 neo-border-sm -rotate-1">
              <span className="text-[10px] font-black uppercase tracking-widest">
                FACEBOOK ANALYTICS
              </span>
            </div>

            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-neo-black leading-none">
              {isLoadingAnalytics && !fbPageInfo?.name
                ? 'SYNCING...'
                : fbPageInfo?.name || 'ANALYTICS_CORE'}
            </h1>

            <p className="mt-3 text-xs font-bold uppercase tracking-widest text-neo-black/50">
              Reactions + comments + shares based dashboard
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-end w-full md:w-auto">
          <div className="min-w-[240px]">
            <label className="block text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">TARGET_PAGE</label>
            <select
              value={selectedPage?.id || ''}
              onChange={event => {
                const page = fbPages.find(item => item.id === event.target.value);
                setSelectedPage(page || null);
              }}
              className="w-full p-3 neo-border-sm bg-white text-xs font-black uppercase tracking-widest"
              disabled={fbPages.length === 0 || isLoadingAnalytics}
            >
              {fbPages.map(page => (
                <option key={page.id} value={page.id}>
                  {(page.name || page.id).toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={handleExportPDF}
            variant="secondary"
            size="lg"
          >
            <i className="fas fa-download mr-2"></i> EXPORT_PDF
          </Button>

          <Button
            onClick={handleRefreshData}
            disabled={isLoadingAnalytics || !isLoggedIn || !!localPageError}
            isLoading={isLoadingAnalytics}
            variant="primary"
            size="lg"
          >
            <i className="fas fa-sync-alt mr-2"></i> SYNC ENGINE
          </Button>
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] mx-auto space-y-12">
        {displayError && (
          <Alert
            type="error"
            message={displayError}
            onClose={() => setLocalPageError(null)}
            className="rotate-1"
          />
        )}

        {/* Tab Switcher */}
        <div className="flex flex-wrap gap-4 mb-8">
          {(['FACEBOOK', 'SCHEDULER', 'GENERATIONS', 'PLANS', 'LEADS', 'MESSAGES'] as AnalyticsTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-black uppercase text-xs tracking-widest border-2 border-neo-black transition-all ${
                activeTab === tab
                  ? 'bg-neo-black text-white shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]'
                  : 'bg-white text-neo-black hover:bg-neo-bg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'FACEBOOK' && (
          !isLoggedIn ? (
          <div className="flex-grow flex items-center justify-center py-40">
            <div className="text-center space-y-8">
              <div className="w-40 h-40 neo-border bg-neo-muted mx-auto flex items-center justify-center -rotate-3 neo-shadow-lg">
                <i className="fas fa-key text-7xl text-neo-black opacity-20"></i>
              </div>

              <div>
                <p className="font-black uppercase tracking-[0.2em] text-neo-black/40 text-xs mb-4">
                  ACCESS_TOKEN_REQUIRED
                </p>
                <p className="text-[10px] font-bold text-neo-black/50">
                  Configure your Facebook App ID and at least one Facebook page in Settings
                  in Settings.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              <KpiCard
                title="REACH"
                value={formatNumber(kpiData.reach)}
                period="Disabled until valid insight metric is confirmed"
                icon="fas fa-bullseye"
                iconBgColor="bg-neo-black"
                isLoading={isLoadingAnalytics && kpiData.reach === null}
              />

              <KpiCard
                title="ENGAGEMENT"
                value={formatNumber(kpiData.engagement)}
                period="Reactions + comments + shares"
                icon="fas fa-heart"
                iconBgColor="bg-neo-accent"
                isLoading={isLoadingAnalytics && kpiData.engagement === null}
              />

              <KpiCard
                title="POSTS"
                value={formatNumber(kpiData.postsPublished)}
                period="Published in last 30 days"
                icon="fas fa-paper-plane"
                iconBgColor="bg-neo-secondary"
                isLoading={
                  isLoadingAnalytics && kpiData.postsPublished === null
                }
              />

              <KpiCard
                title="FOLLOWERS"
                value={formatNumber(kpiData.followers)}
                change={
                  kpiData.newFollowers !== null
                    ? `${kpiData.newFollowers >= 0 ? '+' : ''}${formatNumber(
                        kpiData.newFollowers
                      )} NET`
                    : undefined
                }
                period="Current Page count"
                icon="fas fa-users"
                iconBgColor="bg-neo-muted"
                isLoading={isLoadingAnalytics && kpiData.followers === null}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-7">
                <Card title="ENGAGEMENT_HISTORY" className="h-full !p-8 neo-shadow-lg">
                  <div
                    className="h-[400px] bg-neo-black p-8 neo-border relative overflow-hidden"
                    aria-live="polite"
                  >
                    <div className="absolute inset-0 bg-halftone opacity-10 pointer-events-none"></div>
                    <div className="relative z-10 w-full h-full">
                      {renderEngagementChart()}
                    </div>
                  </div>
                </Card>
              </div>

              <div className="lg:col-span-5">
                <Card title="TOP_PERFORMING_POSTS" className="h-full !p-8 neo-shadow-lg">
                  <div className="space-y-6 max-h-[600px] overflow-y-auto pr-4 scrollbar-hide">
                    {isLoadingAnalytics && topPosts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-10 h-10 neo-border bg-neo-accent animate-spin"></div>
                      </div>
                    ) : topPosts.length > 0 ? (
                      topPosts.map((post: any) => {
                        const postImageUrl = getPostImageUrl(post);
                        const postEngagement = getPostEngagement(post);
                        const reactions =
                          post?.reactions?.summary?.total_count || 0;
                        const comments =
                          post?.comments?.summary?.total_count || 0;
                        const shares = post?.shares?.count || 0;

                        return (
                          <div
                            key={post.id}
                            className="p-6 bg-neo-bg neo-border-sm hover:bg-white transition-colors group relative overflow-hidden"
                          >
                            {postImageUrl && (
                              <img
                                src={postImageUrl}
                                alt="Post attachment"
                                className="w-full h-40 object-cover neo-border-sm mb-4 grayscale group-hover:grayscale-0 transition-all"
                              />
                            )}

                            <p className="text-xs font-bold text-neo-black mb-4 line-clamp-3 uppercase tracking-tight">
                              {post.message || 'NO CAPTION AVAILABLE'}
                            </p>

                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-neo-black/40 mb-4">
                              <span>
                                {post.created_time
                                  ? new Date(
                                      post.created_time
                                    ).toLocaleDateString()
                                  : 'NO DATE'}
                              </span>

                              <span>
                                <i className="fas fa-heart text-neo-accent mr-1"></i>
                                {postEngagement.toLocaleString()}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mb-4">
                              <div className="neo-border-sm bg-white p-2 text-center">
                                <p className="text-[9px] font-black uppercase text-neo-black/40">
                                  React
                                </p>
                                <p className="text-sm font-black text-neo-black">
                                  {reactions.toLocaleString()}
                                </p>
                              </div>

                              <div className="neo-border-sm bg-white p-2 text-center">
                                <p className="text-[9px] font-black uppercase text-neo-black/40">
                                  Comment
                                </p>
                                <p className="text-sm font-black text-neo-black">
                                  {comments.toLocaleString()}
                                </p>
                              </div>

                              <div className="neo-border-sm bg-white p-2 text-center">
                                <p className="text-[9px] font-black uppercase text-neo-black/40">
                                  Share
                                </p>
                                <p className="text-sm font-black text-neo-black">
                                  {shares.toLocaleString()}
                                </p>
                              </div>
                            </div>

                            {post.permalink_url && (
                              <a
                                href={post.permalink_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full text-center py-2 neo-border-sm bg-neo-black text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-neo-accent transition-colors"
                              >
                                OPEN POST
                              </a>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-20 opacity-20">
                        <i className="fas fa-ghost text-6xl mb-4"></i>
                        <p className="font-black uppercase tracking-widest text-xs">
                          NO POSTS FOUND
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </>
        )
      )}

        {activeTab === 'SCHEDULER' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <KpiCard title="TOTAL SCHEDULED" value={formatNumber(schedulerTotal)} icon="fas fa-calendar-check" iconBgColor="bg-neo-black" />
            <KpiCard title="PENDING" value={formatNumber(schedulerPending)} icon="fas fa-clock" iconBgColor="bg-neo-accent" />
            <KpiCard title="COMPLETED" value={formatNumber(schedulerTotal - schedulerPending)} icon="fas fa-check-double" iconBgColor="bg-neo-secondary" />
          </div>
        )}

        {activeTab === 'GENERATIONS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <KpiCard title="TOTAL CANVASES" value={formatNumber(canvasesTotal)} icon="fas fa-layer-group" iconBgColor="bg-neo-black" />
            <KpiCard title="DRAFT STATUS" value={formatNumber(canvasesDraft)} icon="fas fa-pencil-ruler" iconBgColor="bg-neo-muted" />
            <KpiCard title="READY STATUS" value={formatNumber(canvasesReady)} icon="fas fa-check-circle" iconBgColor="bg-neo-secondary" />
          </div>
        )}

        {activeTab === 'PLANS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <KpiCard title="TOTAL PLAN FILES" value={formatNumber(planningFilesTotal)} icon="fas fa-file-alt" iconBgColor="bg-neo-black" />
            <KpiCard title="MARKDOWN FILES" value="N/A" period="Requires Deep Scan" icon="fas fa-file-code" iconBgColor="bg-neo-muted" />
            <KpiCard title="MEDIA/ASSETS" value="N/A" period="Requires Deep Scan" icon="fas fa-photo-video" iconBgColor="bg-neo-muted" />
          </div>
        )}

        {activeTab === 'LEADS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <KpiCard title="TOTAL LEADS" value={formatNumber(leadsTotal)} icon="fas fa-user-friends" iconBgColor="bg-neo-black" />
            <KpiCard title="NEW LEADS" value={formatNumber(leadsNew)} icon="fas fa-user-plus" iconBgColor="bg-neo-accent" />
            <KpiCard title="CONVERTED" value={formatNumber(leadsConverted)} icon="fas fa-handshake" iconBgColor="bg-neo-secondary" />
          </div>
        )}

        {activeTab === 'MESSAGES' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <KpiCard title="ACTIVE THREADS" value={formatNumber(messagesTotal)} icon="fas fa-comments" iconBgColor="bg-neo-black" />
            <KpiCard title="AI REPLIES" value="N/A" period="Requires metrics aggregate" icon="fas fa-robot" iconBgColor="bg-neo-accent" />
          </div>
        )}
      </main>

      <footer className="relative z-10 mt-20 text-center">
        <div className="inline-block px-8 py-4 bg-neo-muted neo-border-sm -rotate-1">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neo-black/60">
            CORE_SYSTEM_LOG // GRAPH_API_SAFE_MODE // INSIGHTS_DISABLED
          </p>
        </div>
      </footer>
    </div>
  );
};

export default AnalyticsPage;