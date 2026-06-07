import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

import { dbGetFacebookSettings } from '../services/settingsService';
import {
  MultiPageFacebookSettings,
  ConfiguredFacebookPage,
  normalizeFacebookPages,
  getDefaultFacebookPage,
  getFacebookPageAccessToken,
} from '../utils/facebookPageUtils';
import { ContentCanvas, CanvasStatus, UserRole, CanvasItem } from '../types';
import { useCanvas } from '../contexts/CanvasContext';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import PostToFacebookModal from '../components/dashboard/PostToFacebookModal';
import { dbGetLeads, Lead } from '../services/crmService';
import { dbGetSchedulerHistory, SchedulerHistoryEntry } from '../services/campaignService';
import { dbFetchCanvases } from '../services/canvasService';
import { getPlanningFiles } from '../services/planningService';
import { chatDbService } from '../services/chatDbService';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { useAnalytics } from '../contexts/AnalyticsContext';
import useFacebookSDK from '../hooks/useFacebookSDK';

type DashboardTab = 'OVERVIEW' | 'FACEBOOK' | 'SCHEDULER' | 'GENERATIONS' | 'PLANS' | 'LEADS' | 'MESSAGES';

const featureTabs: DashboardTab[] = [
  'OVERVIEW',
  'FACEBOOK',
  'SCHEDULER',
  'GENERATIONS',
  'PLANS',
  'LEADS',
  'MESSAGES',
];

const FeatureKpiCard: React.FC<{
  title: string;
  value: string | number;
  period?: string;
  icon: string;
  iconBgColor?: string;
  isLoading?: boolean;
}> = ({
  title,
  value,
  period,
  icon,
  iconBgColor = 'bg-neo-black',
  isLoading = false,
}) => (
  <div className="border-4 border-black bg-white neo-shadow-md p-6 relative overflow-hidden group">
    <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

    <div className="flex items-start justify-between gap-4 relative z-10">
      <div>
        <h3 className="text-[10px] font-black text-black uppercase tracking-[0.2em] mb-2">
          {title}
        </h3>

        {isLoading ? (
          <div className="w-20 h-8 bg-black/10 animate-pulse border-2 border-black"></div>
        ) : (
          <p className="text-4xl font-black text-black leading-none tracking-tighter">
            {value}
          </p>
        )}

        {period && !isLoading && (
          <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-black/45">
            {period}
          </p>
        )}
      </div>

      <div
        className={`w-12 h-12 border-2 border-black flex items-center justify-center ${iconBgColor} text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] group-hover:translate-x-[2px] group-hover:translate-y-[2px] group-hover:shadow-none transition-all`}
      >
        <i className={icon}></i>
      </div>
    </div>
  </div>
);



const CanvasDisplayCard: React.FC<{
  canvas: ContentCanvas;
  onUpdateStatus: (canvasId: string, status: CanvasStatus, feedback?: string) => Promise<void>;
  onDelete: (canvasId: string) => Promise<void>;
  onOpenPostModal: (canvas: ContentCanvas) => void;
  currentUserRole: UserRole | undefined;
  currentUserId: string | undefined;
  isFacebookReady: boolean;
  isProcessing: boolean;
}> = ({
  canvas,
  onUpdateStatus,
  onDelete,
  onOpenPostModal,
  currentUserRole,
  currentUserId,
  isFacebookReady,
  isProcessing,
}) => {
  const isAdmin = currentUserRole === UserRole.ADMIN;
  const [adminFeedbackInput, setAdminFeedbackInput] = useState('');

  const handleApprove = async () => {
    if (isProcessing) return;
    await onUpdateStatus(canvas.id, CanvasStatus.APPROVED);
  };

  const handleRequestRevision = async () => {
    if (isProcessing) return;

    if (!adminFeedbackInput.trim() && canvas.status === CanvasStatus.PENDING_REVIEW) {
      alert('Please provide feedback when requesting revisions.');
      return;
    }

    await onUpdateStatus(canvas.id, CanvasStatus.NEEDS_REVISION, adminFeedbackInput);
    setAdminFeedbackInput('');
  };

  const handleDelete = async () => {
    if (isProcessing) return;

    if (window.confirm(`Are you sure you want to delete canvas "${canvas.title || canvas.id}"?`)) {
      await onDelete(canvas.id);
    }
  };

  const getStatusInfo = (status: CanvasStatus) => {
    switch (status) {
      case CanvasStatus.DRAFT:
        return { color: 'bg-white', text: 'DRAFT', icon: 'fa-pencil-alt' };
      case CanvasStatus.PENDING_REVIEW:
        return { color: 'bg-neo-secondary', text: 'REVIEW', icon: 'fa-search' };
      case CanvasStatus.NEEDS_REVISION:
        return { color: 'bg-neo-muted', text: 'REVISE', icon: 'fa-sync' };
      case CanvasStatus.APPROVED:
        return { color: 'bg-neo-accent', text: 'READY', icon: 'fa-check' };
      default:
        return { color: 'bg-white', text: 'UNKNOWN', icon: 'fa-question' };
    }
  };

  const statusInfo = getStatusInfo(canvas.status);
  const itemCount = canvas.items?.length || 0;
  const canEditOrDelete =
    isAdmin ||
    (canvas.createdBy === currentUserId &&
      (canvas.status === CanvasStatus.DRAFT || canvas.status === CanvasStatus.NEEDS_REVISION));

  return (
    <Card hoverEffect className="flex flex-col h-full !p-0 neo-card-hover group">
      <div className="p-5 neo-border-b bg-neo-black text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 -rotate-12 translate-x-2 -translate-y-2 group-hover:scale-125 transition-transform">
          <i className={`fas ${statusInfo.icon} text-6xl`}></i>
        </div>

        <div className="flex justify-between items-start relative z-10 gap-3">
          <h3
            className="text-xl font-black uppercase tracking-tighter truncate max-w-[70%]"
            title={canvas.title || 'Untitled'}
          >
            {canvas.title || 'Untitled'}
          </h3>

          <div className={`${statusInfo.color} neo-border-sm px-2 py-1 rotate-3 group-hover:rotate-0 transition-transform`}>
            <span className="text-[10px] font-black text-neo-black uppercase tracking-widest">
              {statusInfo.text}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 relative z-10">
          <div className="bg-white/10 px-2 py-1 text-[10px] font-bold uppercase">
            {canvas.createdAt ? new Date(canvas.createdAt).toLocaleDateString() : 'No date'}
          </div>
          {itemCount > 0 && (
            <div className="bg-white/10 px-2 py-1 text-[10px] font-bold uppercase">
              {itemCount} ITEMS
            </div>
          )}
        </div>
      </div>

      <div className="p-6 flex-grow flex flex-col bg-white group-hover:bg-neo-bg transition-colors">
        <div className="mb-4 relative">
          <div className="absolute -left-6 top-0 w-1 h-full bg-neo-black opacity-10"></div>
          <p className="text-xs font-black uppercase tracking-widest text-neo-black/40 mb-2">
            Primary Content
          </p>
          {itemCount > 0 ? (
            <p className="text-sm font-bold leading-relaxed line-clamp-3">
              {canvas.items[0].originalText}
            </p>
          ) : (
            <p className="text-sm font-bold italic opacity-40">Empty Canvas.</p>
          )}
        </div>

        {canvas.overallImagePreview && (
          <div className="my-4 relative">
            <div className="absolute inset-0 neo-border translate-x-2 translate-y-2 pointer-events-none"></div>
            <img
              src={canvas.overallImagePreview}
              alt="Preview"
              className="neo-border w-full aspect-video object-cover grayscale group-hover:grayscale-0 transition-all"
            />
          </div>
        )}

        {canvas.status === CanvasStatus.NEEDS_REVISION && canvas.adminFeedback && (
          <div className="my-4 bg-neo-muted p-4 neo-border-sm rotate-1">
            <p className="text-[10px] font-black uppercase tracking-widest mb-1">Feedback</p>
            <p className="text-xs font-bold italic">&quot;{canvas.adminFeedback}&quot;</p>
          </div>
        )}

        <div className="mt-auto pt-6 flex flex-col gap-3">
          {isAdmin && canvas.status === CanvasStatus.PENDING_REVIEW && (
            <div className="bg-neo-secondary/10 p-4 neo-border-sm mb-2">
              <Button
                onClick={handleApprove}
                variant="success"
                size="sm"
                className="w-full"
                disabled={isProcessing}
                isLoading={isProcessing}
              >
                APPROVE SYSTEM
              </Button>

              <Input
                type="textarea"
                placeholder="REVISION NOTES..."
                value={adminFeedbackInput}
                onChange={(event) => setAdminFeedbackInput(event.target.value)}
                rows={2}
                wrapperClassName="my-3 mb-0"
                className="!text-xs"
                disabled={isProcessing}
              />

              <Button
                onClick={handleRequestRevision}
                variant="warning"
                size="sm"
                className="w-full mt-3"
                disabled={isProcessing || !adminFeedbackInput.trim()}
                isLoading={isProcessing}
              >
                DEMAND REVISION
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Link to={`/generate?canvasId=${canvas.id}`} className="block">
              <Button variant="secondary" size="sm" className="w-full !px-2" disabled={isProcessing}>
                {canvas.status === CanvasStatus.DRAFT ||
                (canvas.createdBy === currentUserId && canvas.status === CanvasStatus.NEEDS_REVISION)
                  ? 'EDIT'
                  : 'VIEW'}
              </Button>
            </Link>

            {canEditOrDelete && (
              <Button
                onClick={handleDelete}
                variant="danger"
                size="sm"
                className="w-full"
                disabled={isProcessing}
                isLoading={isProcessing}
              >
                DELETE
              </Button>
            )}
          </div>

          {canvas.status === CanvasStatus.APPROVED && (
            <Button
              onClick={() => onOpenPostModal(canvas)}
              variant="primary"
              size="md"
              className="w-full mt-1"
              disabled={!isFacebookReady || isProcessing}
              icon={<i className="fab fa-facebook"></i>}
            >
              POST TO FACEBOOK
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

const DashboardPage: React.FC = () => {
  const {
    canvases: allCanvasesFromContext,
    updateCanvasStatus: updateCanvasStatusInContext,
    deleteCanvas: deleteCanvasInContext,
    isLoadingCanvases,
    fetchCanvases,
  } = useCanvas();
  const { currentUser } = useAuth();

  const [displayedCanvases, setDisplayedCanvases] = useState<ContentCanvas[]>([]);
  const [canvasFilter, setCanvasFilter] = useState<CanvasStatus | 'all'>('all');
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [operationInProgress, setOperationInProgress] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [selectedCanvasForPost, setSelectedCanvasForPost] = useState<ContentCanvas | null>(null);
  const [isPostingToFacebook, setIsPostingToFacebook] = useState(false);
  const [postToFacebookError, setPostToFacebookError] = useState<string | null>(null);
  const [postToFacebookSuccess, setPostToFacebookSuccess] = useState<string | null>(null);

  const [fbSettings, setFbSettings] = useState<MultiPageFacebookSettings | null>(null);
  const [fbPages, setFbPages] = useState<ConfiguredFacebookPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<ConfiguredFacebookPage | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<SchedulerHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingAuxData, setIsRefreshingAuxData] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('OVERVIEW');

  const [schedulerTotal, setSchedulerTotal] = useState(0);
  const [schedulerPending, setSchedulerPending] = useState(0);

  const [canvasesTotal, setCanvasesTotal] = useState(0);
  const [canvasesDraft, setCanvasesDraft] = useState(0);
  const [canvasesReady, setCanvasesReady] = useState(0);

  const [planningFilesTotal, setPlanningFilesTotal] = useState(0);

  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsNew, setLeadsNew] = useState(0);
  const [leadsConverted, setLeadsConverted] = useState(0);

  const [messagesTotal, setMessagesTotal] = useState(0);

  const {
    fbPageInfo,
    kpiData,
    engagementOverTime,
    topPosts,
    isLoadingAnalytics,
    analyticsError,
    loadAnalytics,
    setAnalyticsPage,
  } = useAnalytics();

  const selectedPageAccessToken = selectedPage ? getFacebookPageAccessToken(selectedPage) : null;

  const { fbApi, error: sdkError } = useFacebookSDK(
    fbSettings?.appId,
    undefined,
    selectedPageAccessToken || fbSettings?.accessToken
  );

  const isFacebookReady = Boolean(
    fbSettings?.appId && selectedPage?.id && selectedPageAccessToken && fbApi
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

  const formatNumber = (value: number | null | undefined, fallback = '0') => {
    if (value === null || value === undefined) return fallback;
    return value.toLocaleString();
  };

  const loadAuxiliaryMetrics = React.useCallback(async (page: ConfiguredFacebookPage | null) => {
    setIsRefreshingAuxData(true);

    try {
      const history = await dbGetSchedulerHistory();
      const pageScopedHistory = page
        ? history.filter((h: any) =>
            h.pageId === page.id ||
            h.page === page.name ||
            h.page === page.id
          )
        : history;

      setScheduledPosts(pageScopedHistory);
      setSchedulerTotal(pageScopedHistory.length);

      const now = Date.now();
      const pendingCount = pageScopedHistory.filter((h: any) => {
        const scheduledTime = new Date(h.time).getTime();
        return scheduledTime > now && h.status === 'SCHEDULED';
      }).length;
      setSchedulerPending(pendingCount);

      const canvases = await (dbFetchCanvases as any)(page?.id);
      setCanvasesTotal(canvases.length);
      setCanvasesDraft(canvases.filter((canvas: any) => canvas.status === CanvasStatus.DRAFT).length);
      setCanvasesReady(
        canvases.filter((canvas: any) =>
          canvas.status === CanvasStatus.APPROVED ||
          canvas.status === CanvasStatus.PENDING_REVIEW
        ).length
      );

      const planningRes = await getPlanningFiles();
      let fileCount = 0;

      const countFiles = (items: any[]) => {
        items.forEach(item => {
          if (item.type === 'file') fileCount += 1;
          if (item.children) countFiles(item.children);
        });
      };

      if (Array.isArray(planningRes) && planningRes.length) {
        countFiles(planningRes);
      }
      setPlanningFilesTotal(fileCount);

      const leadsData = await dbGetLeads();
      const pageScopedLeads = page
        ? leadsData.filter((lead: any) =>
            !lead.facebookPageId ||
            lead.facebookPageId === page.id ||
            lead.facebookPageName === page.name
          )
        : leadsData;

      setLeads(pageScopedLeads);
      setLeadsTotal(pageScopedLeads.length);
      setLeadsNew(pageScopedLeads.filter((lead: any) => lead.status === 'NEW').length);
      setLeadsConverted(
        pageScopedLeads.filter((lead: any) => lead.status === 'WON' || lead.status === 'QUALIFIED').length
      );

      const conversationStates = await chatDbService.getAllConversationStates(page?.id);
      setMessagesTotal(Object.keys(conversationStates || {}).length);
    } catch (err) {
      console.error('Failed to load dashboard auxiliary metrics:', err);
      setDashboardError('Some dashboard metrics could not be loaded. Check the console for details.');
    } finally {
      setIsRefreshingAuxData(false);
    }
  }, []);

  useEffect(() => {
    const loadDashboardSettings = async () => {
      setIsLoading(true);
      setDashboardError(null);

      try {
        const settings = (await dbGetFacebookSettings()) as MultiPageFacebookSettings;
        const pages = normalizeFacebookPages(settings);
        const defaultPage = getDefaultFacebookPage(pages, settings);

        setFbSettings(settings);
        setFbPages(pages);
        setSelectedPage(defaultPage || null);

        if (!settings.appId) {
          setDashboardError('Facebook App ID is not configured. Add it in Settings to enable Facebook analytics.');
        } else if (pages.length === 0 || !defaultPage) {
          setDashboardError('No Facebook pages are configured. Add at least one page in Settings.');
        } else if (!getFacebookPageAccessToken(defaultPage)) {
          setDashboardError('The selected Facebook Page Access Token is not configured.');
        }
      } catch (err) {
        console.error('Failed to load dashboard settings:', err);
        setDashboardError('Could not load Facebook settings.');
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardSettings();
  }, []);

  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);

  useEffect(() => {
    if (isLoadingCanvases) return;

    if (currentUser?.role !== UserRole.ADMIN) {
      setDisplayedCanvases(
        allCanvasesFromContext.filter(
          (canvas) => canvas.createdBy === currentUser?.id || canvas.status === CanvasStatus.APPROVED
        )
      );
      return;
    }

    setDisplayedCanvases(allCanvasesFromContext);
  }, [allCanvasesFromContext, currentUser, isLoadingCanvases]);

  useEffect(() => {
    loadAuxiliaryMetrics(selectedPage);
  }, [selectedPage?.id, selectedPage?.name, loadAuxiliaryMetrics]);

  useEffect(() => {
    setAnalyticsPage(selectedPage);
  }, [selectedPage, setAnalyticsPage]);

  useEffect(() => {
    if (sdkError) {
      setDashboardError(`Facebook API Error: ${sdkError}`);
      return;
    }

    const isLoggedIn = Boolean(selectedPage?.id && selectedPageAccessToken);

    if (
      isLoggedIn &&
      fbSettings &&
      pageScopedFbApi &&
      fbSettings.appId &&
      selectedPage?.id &&
      selectedPageAccessToken
    ) {
      loadAnalytics(pageScopedFbApi, false, selectedPage);
    }
  }, [selectedPage, fbSettings, pageScopedFbApi, loadAnalytics, selectedPageAccessToken, sdkError]);

  const handleRefreshData = async () => {
    setDashboardError(null);
    await loadAuxiliaryMetrics(selectedPage);

    if (
      fbSettings &&
      pageScopedFbApi &&
      fbSettings.appId &&
      selectedPage?.id &&
      selectedPageAccessToken
    ) {
      loadAnalytics(pageScopedFbApi, true, selectedPage);
      return;
    }

    setDashboardError('Auxiliary dashboard data was refreshed, but Facebook analytics could not sync because settings or access token is missing.');
  };

  const handleExportPDF = async () => {
    setDashboardError(null);

    try {
      const dashboardElement = document.getElementById('dashboard-export-root') as HTMLElement;
      if (!dashboardElement) {
        throw new Error('Dashboard export element not found.');
      }

      const canvas = await html2canvas(dashboardElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#FFFDF5',
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

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const pageName = selectedPage?.name || fbPageInfo?.name || 'Executive_Dashboard';
      pdf.save(`SteadySocial_Dashboard_${pageName}.pdf`);
    } catch (err: any) {
      console.error('Failed to export dashboard PDF:', err);
      setDashboardError(`PDF Export Failed: ${err.message}`);
    }
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
      ...engagementOverTime.map((value) =>
        typeof value.value === 'number' ? value.value : 0
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
      (_, index) => (maxValue / numYTicks) * index
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
          A bar chart showing daily engagement. Engagement is calculated from reactions, comments, and shares.
        </desc>

        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {yTickValues.map((tickValue, index) => {
            const y = chartHeight - (maxValue > 0 ? (tickValue / maxValue) * chartHeight : 0);

            return (
              <g key={`y-tick-${index}`}>
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

            const xPos = index * (barWidth + barSpacing) + barWidth / 2 + barSpacing / 2;

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
            const barActualHeight = maxValue > 0 ? (itemValue / maxValue) * chartHeight : 0;
            const x = index * (barWidth + barSpacing) + barSpacing / 2;
            const y = chartHeight - barActualHeight;
            const dateLabel = new Date(item.end_time).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

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
                <title>{`${dateLabel}: ${itemValue.toLocaleString()} engagements`}</title>
              </rect>
            );
          })}
        </g>

        <text
          transform={`translate(${margin.left / 3}, ${margin.top + chartHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="10"
          className="fill-white/70 font-medium"
          aria-hidden="true"
        >
          Engagement
        </text>

        <text
          transform={`translate(${margin.left + chartWidth / 2}, ${svgHeight - margin.bottom / 2.5})`}
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

  const handleUpdateCanvasStatus = async (canvasId: string, status: CanvasStatus, feedback?: string) => {
    setOperationInProgress(true);

    try {
      const updatedCanvas = await updateCanvasStatusInContext(canvasId, status, currentUser?.id, feedback);

      if (updatedCanvas) {
        setNotification({ type: 'success', message: `Canvas status updated to ${status?.replace('_', ' ')}.` });
        await loadAuxiliaryMetrics(selectedPage);
      } else {
        setNotification({ type: 'error', message: 'Failed to update canvas status.' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error updating canvas status.' });
    } finally {
      setOperationInProgress(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleDeleteCanvas = async (canvasId: string) => {
    setOperationInProgress(true);

    try {
      await deleteCanvasInContext(canvasId);
      setNotification({ type: 'success', message: 'Canvas deleted successfully.' });
      await loadAuxiliaryMetrics(selectedPage);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error deleting canvas.' });
    } finally {
      setOperationInProgress(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleOpenPostModal = (canvas: ContentCanvas) => {
    if (!selectedPage?.id) {
      setNotification({ type: 'info', message: 'Please select a Facebook page before posting.' });
      return;
    }

    if (!fbSettings?.appId) {
      setNotification({ type: 'info', message: 'Facebook App ID is not configured in Settings.' });
      return;
    }

    if (!selectedPageAccessToken || !isFacebookReady) {
      setNotification({ type: 'info', message: 'Selected Facebook page is not ready for posting. Check its access token in Settings.' });
      return;
    }

    setSelectedCanvasForPost(canvas);
    setIsPostModalOpen(true);
    setPostToFacebookError(null);
    setPostToFacebookSuccess(null);
  };

  const handleConfirmPostToFacebook = async (
    _selectedItem: CanvasItem,
    textToPost: string,
    imageToUse?: string | null,
    newImageFile?: File | null,
    isScheduled?: boolean,
    scheduledPublishTime?: number
  ) => {
    if (!selectedPage?.id || !selectedPageAccessToken || !pageScopedFbApi || !isFacebookReady) {
      setPostToFacebookError('Facebook connection is not ready. Select a page with a valid access token in Settings.');
      return;
    }

    setIsPostingToFacebook(true);
    setPostToFacebookError(null);
    setPostToFacebookSuccess(null);

    try {
      let imageNote = '';

      if (newImageFile || (imageToUse && imageToUse.startsWith('data:image'))) {
        setPostToFacebookSuccess(isScheduled ? 'Preparing image for schedule...' : 'Preparing image for upload...');

        let imageDataUrl: string | null = null;

        if (newImageFile) {
          const reader = new FileReader();
          imageDataUrl = await new Promise<string>((resolve, reject) => {
            reader.onerror = () => reject(new Error('Failed to read image file.'));
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(newImageFile);
          });
          setPostToFacebookSuccess(isScheduled ? 'New image prepared. Scheduling on Facebook...' : 'New image prepared. Uploading to Facebook...');
        } else {
          imageDataUrl = imageToUse!;
          setPostToFacebookSuccess(isScheduled ? 'Original image prepared. Scheduling on Facebook...' : 'Original image prepared. Uploading to Facebook...');
        }

        const photoParams: any = {
          imageDataUrl,
          message: textToPost,
          published: !(isScheduled && scheduledPublishTime),
        };

        if (isScheduled && scheduledPublishTime) {
          photoParams.scheduled_publish_time = scheduledPublishTime;
        }

        await pageScopedFbApi<any>(`/${selectedPage.id}/photos`, 'post', photoParams);

        imageNote = isScheduled
          ? ` Image scheduled for ${new Date(scheduledPublishTime! * 1000).toLocaleString()}.`
          : ' Image uploaded and posted with caption.';
      } else if (imageToUse && (imageToUse.startsWith('http://') || imageToUse.startsWith('https://'))) {
        setPostToFacebookSuccess(isScheduled ? 'Image URL provided. Scheduling on Facebook...' : 'Image URL provided. Posting to Facebook...');

        const photoParams: any = {
          imageUrl: imageToUse,
          message: textToPost,
          published: !(isScheduled && scheduledPublishTime),
        };

        if (isScheduled && scheduledPublishTime) {
          photoParams.scheduled_publish_time = scheduledPublishTime;
        }

        await pageScopedFbApi<any>(`/${selectedPage.id}/photos`, 'post', photoParams);

        imageNote = isScheduled
          ? ` Image URL scheduled for ${new Date(scheduledPublishTime! * 1000).toLocaleString()}.`
          : ' Image URL posted as photo with caption.';
      } else {
        setPostToFacebookSuccess(isScheduled ? 'Preparing scheduled text-only post...' : 'Preparing text-only post...');

        const feedParams: any = {
          message: textToPost,
          published: !(isScheduled && scheduledPublishTime),
        };

        if (isScheduled && scheduledPublishTime) {
          feedParams.scheduled_publish_time = scheduledPublishTime;
        }

        await pageScopedFbApi<any>(`/${selectedPage.id}/feed`, 'post', feedParams);
      }

      setPostToFacebookSuccess(
        isScheduled
          ? `Successfully scheduled post for Facebook page "${selectedPage.name || selectedPage.id}".${imageNote}`
          : `Successfully posted to Facebook page "${selectedPage.name || selectedPage.id}".${imageNote}`
      );
    } catch (err: any) {
      console.error('Error posting to Facebook:', err);
      const errorMessage = err.message || err.error?.message || 'An unknown error occurred.';
      setPostToFacebookError(isScheduled ? `Failed to schedule: ${errorMessage}` : `Failed to post: ${errorMessage}`);
      setPostToFacebookSuccess(null);
    } finally {
      setIsPostingToFacebook(false);
    }
  };

  const filteredAndSortedCanvases = displayedCanvases
    .filter((canvas) => canvasFilter === 'all' || canvas.status === canvasFilter)
    .sort((a, b) => (b.submittedAt || b.createdAt || 0) - (a.submittedAt || a.createdAt || 0));

  const canvasFilterOptions: { label: string; value: CanvasStatus | 'all' }[] = [
    { label: 'All Canvases', value: 'all' },
    ...(Object.values(CanvasStatus) as CanvasStatus[]).map((status) => ({
      label: status.replace('_', ' ').toUpperCase(),
      value: status,
    })),
  ];

  const followerCount = kpiData.followers !== null ? kpiData.followers : 0;
  const followerGrowth = kpiData.newFollowers !== null
    ? `${kpiData.newFollowers >= 0 ? '+' : ''}${formatNumber(kpiData.newFollowers)} net`
    : 'No trend data';

  let engagementRate = '0%';
  if (kpiData.engagement !== null && kpiData.followers && kpiData.followers > 0) {
    engagementRate = `${((kpiData.engagement / kpiData.followers) * 100).toFixed(1)}%`;
  } else if (kpiData.engagement !== null) {
    engagementRate = kpiData.engagement.toLocaleString();
  }

  const postReach = kpiData.reach !== null && kpiData.reach > 0 ? kpiData.reach.toLocaleString() : '0';
  const displayLeads = leads.slice(0, 5);

  const displayScheduled = scheduledPosts
    .filter(post => post.status === 'SCHEDULED')
    .slice(0, 5);

  const leadCounts = {
    NEW: leads.filter(lead => lead.status === 'NEW').length,
    CONTACTED: leads.filter(lead => lead.status === 'CONTACTED').length,
    QUALIFIED: leads.filter(lead => lead.status === 'QUALIFIED').length,
    WON: leads.filter(lead => lead.status === 'WON').length,
    LOST: leads.filter(lead => lead.status === 'LOST').length,
  };
  const totalLeadsCount = leads.length;

  const getPercent = (count: number) => {
    if (totalLeadsCount === 0) return 0;
    return Math.round((count / totalLeadsCount) * 100);
  };

  const displayError = dashboardError || analyticsError;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#FFFDF5]">
        <div className="w-16 h-16 border-4 border-black bg-[#FFD93D] animate-spin neo-shadow-sm flex items-center justify-center">
          <i className="fas fa-bolt text-black text-2xl"></i>
        </div>
        <p className="mt-6 text-black font-black uppercase tracking-widest animate-pulse">Loading dashboard console...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#FFFDF5] p-6 md:p-8 font-space relative">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <div id="dashboard-export-root" className="max-w-7xl mx-auto space-y-8 relative z-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 border-4 border-black neo-shadow-md">
          <div className="flex items-center gap-4">
            {fbPageInfo?.picture?.data?.url && (
              <div className="relative hidden sm:block">
                <div className="absolute inset-0 border-2 border-black bg-black translate-x-1 translate-y-1"></div>
                <img
                  src={fbPageInfo.picture.data.url}
                  alt="Facebook Page"
                  className="relative w-16 h-16 border-2 border-black object-cover bg-white"
                />    
              </div>
            )}

            <div className="space-y-1">
              <div className="inline-block bg-neo-accent text-white px-2 py-0.5 mb-1 border-2 border-black text-[10px] font-black uppercase tracking-widest rotate-1">
                SYSTEM_STATUS: ONLINE
              </div>
              <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-black leading-none">
                EXECUTIVE_<span className="text-neo-accent outline-text">DASHBOARD</span>
              </h1>
              <p className="text-black/60 text-xs font-bold uppercase tracking-wider">
                Marketing analytics pipeline, lead control, content, and message metrics.
              </p>
            </div>
          </div>
        </header>


        <div className="flex flex-wrap justify-end items-center gap-3">
          {fbPages.length > 0 && (
            <div className="relative">
              <select
                value={selectedPage?.id || ''}
                onChange={(event) => {
                  const page = fbPages.find(item => item.id === event.target.value);
                  setSelectedPage(page || null);
                }}
                className="appearance-none bg-[#FFFDF5] border-2 border-black text-black text-xs font-black uppercase tracking-widest py-2.5 px-4 pr-10 hover:bg-[#FFD93D] cursor-pointer transition-colors focus:outline-none"
                disabled={isLoadingAnalytics || isRefreshingAuxData}
              >
                {fbPages.map(page => (
                  <option key={page.id} value={page.id}>
                    {page.name || page.id}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-black">
                <i className="fas fa-chevron-down text-xs"></i>
              </div>
            </div>
          )}

          <button
            onClick={handleExportPDF}
            className="w-full md:w-auto bg-white hover:bg-[#FFFDF5] text-black font-black border-2 border-black uppercase text-xs tracking-wider py-2.5 px-4 neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2"
          >
            <i className="fas fa-download"></i> Export PDF
          </button>

          <button
            onClick={handleRefreshData}
            disabled={isLoadingAnalytics || isRefreshingAuxData}
            className="w-full md:w-auto bg-neo-black hover:bg-neo-accent text-white font-black border-2 border-black uppercase text-xs tracking-wider py-2.5 px-4 neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isLoadingAnalytics || isRefreshingAuxData ? (
              <>
                <i className="fas fa-spinner animate-spin"></i> Syncing
              </>
            ) : (
              <>
                <i className="fas fa-sync-alt"></i> Sync Engine
              </>
            )}
          </button>

          <Link to="/generate" className="w-full md:w-auto">
            <button className="w-full bg-[#FFD93D] hover:bg-[#FFE066] text-black font-black border-2 border-black uppercase text-xs tracking-wider py-2.5 px-4 neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2">
              <i className="fas fa-magic"></i> Canvas Generator
            </button>
          </Link>
        </div>
        {displayError && (
          <div className="bg-[#FF6B6B] text-white border-4 border-black neo-shadow-md p-4 font-bold text-xs uppercase tracking-wider flex items-start justify-between gap-4">
            <span>{displayError}</span>
            <button
              onClick={() => setDashboardError(null)}
              className="text-white font-black"
              aria-label="Dismiss dashboard error"
            >
              ×
            </button>
          </div>
        )}

        {notification && (
          <Alert
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
            className="mb-2"
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 border-4 border-black bg-white neo-shadow-md p-6 flex flex-col justify-between">
            <div className="border-b-2 border-black pb-3 mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-black">Key Performance Indicators</h2>
                <p className="text-black/60 text-xs uppercase font-bold tracking-wide">Real-time Meta page analytics from the selected page</p>
              </div>
              <span className="bg-neo-muted text-black px-2 py-0.5 border border-black text-[9px] font-black uppercase tracking-wider rotate-2">
                EXECUTIVE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="border-2 border-black neo-shadow-sm overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-4 flex flex-col justify-between h-32">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-90">Total Followers</span>
                  <i className="fas fa-users text-sm opacity-80"></i>
                </div>
                <div>
                  {isLoadingAnalytics ? (
                    <div className="h-8 w-24 bg-white/20 animate-pulse rounded mb-1"></div>
                  ) : (
                    <h3 className="text-3xl font-black">{followerCount.toLocaleString()}</h3>
                  )}
                  <p className="text-[10px] font-bold mt-1 text-emerald-300 flex items-center gap-1 uppercase">
                    <i className="fas fa-arrow-trend-up"></i> {followerGrowth}
                  </p>
                </div>
              </div>

              <div className="border-2 border-black neo-shadow-sm overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-4 flex flex-col justify-between h-32">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-90">Engagement Rate</span>
                  <i className="fas fa-chart-line text-sm opacity-80"></i>
                </div>
                <div>
                  {isLoadingAnalytics ? (
                    <div className="h-8 w-24 bg-white/20 animate-pulse rounded mb-1"></div>
                  ) : (
                    <h3 className="text-3xl font-black">{engagementRate}</h3>
                  )}
                  <p className="text-[10px] font-bold mt-1 text-white/75 uppercase">
                    Reactions + comments + shares
                  </p>
                </div>
              </div>

              <div className="border-2 border-black neo-shadow-sm overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-4 flex flex-col justify-between h-32">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-90">Total Reach</span>
                  <i className="fas fa-eye text-sm opacity-80"></i>
                </div>
                <div>
                  {isLoadingAnalytics ? (
                    <div className="h-8 w-24 bg-white/20 animate-pulse rounded mb-1"></div>
                  ) : (
                    <h3 className="text-3xl font-black">{postReach}</h3>
                  )}
                  <p className="text-[10px] font-bold mt-1 text-white/75 uppercase">
                    Insight metric status
                  </p>
                </div>
              </div>

              <div className="border-2 border-black neo-shadow-sm overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-4 flex flex-col justify-between h-32">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-90">Posts</span>
                  <i className="fas fa-paper-plane text-sm opacity-80"></i>
                </div>
                <div>
                  {isLoadingAnalytics ? (
                    <div className="h-8 w-24 bg-white/20 animate-pulse rounded mb-1"></div>
                  ) : (
                    <h3 className="text-3xl font-black">{formatNumber(kpiData.postsPublished)}</h3>
                  )}
                  <p className="text-[10px] font-bold mt-1 text-white/75 uppercase">
                    Last 30 days
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-4 border-black bg-[#FFFDF5] neo-shadow-md p-6 flex flex-col justify-between">
            <div className="border-b-2 border-black pb-3 mb-4">
              <h2 className="text-lg font-black uppercase tracking-tight text-black">Lead Funnel Overview</h2>
              <p className="text-black/60 text-xs uppercase font-bold tracking-wide">Sales pipeline conversion counts</p>
            </div>

            <div className="space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-black/75">
                  <span>Pipeline segments</span>
                  <span>{totalLeadsCount} total leads</span>
                </div>

                <div className="w-full bg-black h-8 border-2 border-black flex overflow-hidden neo-shadow-sm">
                  {leadCounts.NEW > 0 && (
                    <div style={{ width: `${getPercent(leadCounts.NEW)}%` }} className="bg-[#FF6B6B] h-full" title={`New: ${leadCounts.NEW}`} />
                  )}
                  {leadCounts.CONTACTED > 0 && (
                    <div style={{ width: `${getPercent(leadCounts.CONTACTED)}%` }} className="bg-[#FFD93D] h-full" title={`Inquiry: ${leadCounts.CONTACTED}`} />
                  )}
                  {leadCounts.QUALIFIED > 0 && (
                    <div style={{ width: `${getPercent(leadCounts.QUALIFIED)}%` }} className="bg-[#C4B5FD] h-full" title={`Qualified: ${leadCounts.QUALIFIED}`} />
                  )}
                  {leadCounts.WON > 0 && (
                    <div style={{ width: `${getPercent(leadCounts.WON)}%` }} className="bg-[#4ADE80] h-full" title={`Won: ${leadCounts.WON}`} />
                  )}
                  {leadCounts.LOST > 0 && (
                    <div style={{ width: `${getPercent(leadCounts.LOST)}%` }} className="bg-[#94A3B8] h-full" title={`Lost: ${leadCounts.LOST}`} />
                  )}
                  {totalLeadsCount === 0 && (
                    <div className="w-full bg-[#FFFDF5] h-full flex items-center justify-center text-[9px] text-black/50 font-black uppercase">
                      No registered leads
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="flex items-center gap-2 p-1.5 border border-black bg-white text-[10px] font-bold">
                  <span className="w-3 h-3 bg-[#FF6B6B] border border-black flex-shrink-0"></span>
                  <span className="truncate text-black">New ({leadCounts.NEW})</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 border border-black bg-white text-[10px] font-bold">
                  <span className="w-3 h-3 bg-[#FFD93D] border border-black flex-shrink-0"></span>
                  <span className="truncate text-black">Inquiry ({leadCounts.CONTACTED})</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 border border-black bg-white text-[10px] font-bold">
                  <span className="w-3 h-3 bg-[#C4B5FD] border border-black flex-shrink-0"></span>
                  <span className="truncate text-black">Qualified ({leadCounts.QUALIFIED})</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 border border-black bg-white text-[10px] font-bold">
                  <span className="w-3 h-3 bg-[#4ADE80] border border-black flex-shrink-0"></span>
                  <span className="truncate text-black">Won ({leadCounts.WON})</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 border border-black bg-white text-[10px] font-bold col-span-2">
                  <span className="w-3 h-3 bg-[#94A3B8] border border-black flex-shrink-0"></span>
                  <span className="truncate text-black">Lost ({leadCounts.LOST}) - {getPercent(leadCounts.LOST)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="bg-white p-6 border-4 border-black neo-shadow-md lg:col-span-2 space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b-2 border-black pb-3">
              <div>
                <h2 className="text-lg font-black uppercase text-black">Messenger Leads & Demographics</h2>
                <p className="text-black/60 text-xs font-bold uppercase tracking-wider">Demographics registered from Facebook Graph/AI analysis.</p>
              </div>
              <Link to="/crm" className="text-neo-accent hover:underline text-xs font-black uppercase tracking-wider">
                Manage CRM Console →
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-black text-black font-black uppercase tracking-wider">
                    <th className="pb-3 pr-2">Lead Name</th>
                    <th className="pb-3 pr-2">Gender & Age</th>
                    <th className="pb-3 pr-2">Mapped Location</th>
                    <th className="pb-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {displayLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-[#FFFDF5] transition-colors">
                      <td className="py-3.5 pr-2">
                        <div className="font-black text-black uppercase">{lead.name}</div>
                        <div className="text-[10px] text-black/50 font-bold">{lead.email || lead.phone || 'No direct contact details'}</div>
                      </td>
                      <td className="py-3.5 pr-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 border border-black text-[9px] font-black uppercase ${
                            lead.gender?.toLowerCase() === 'female' ? 'bg-pink-100 text-pink-700' :
                            lead.gender?.toLowerCase() === 'male' ? 'bg-blue-100 text-blue-700' :
                            'bg-[#FFFDF5] text-black/60'
                          }`}>
                            {lead.gender || 'Unknown'}
                          </span>
                          {lead.age && (
                            <span className="text-[9px] text-black font-black bg-slate-100 border border-black px-2 py-0.5">
                              AGE: {lead.age}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 pr-2 text-[10px] font-bold text-black/70 max-w-[180px] truncate" title={lead.address}>
                        {lead.address || 'NOT PROVIDED'}
                      </td>
                      <td className="py-3.5 text-center">
                        <span className={`px-2.5 py-1 border-2 border-black text-[9px] font-black uppercase tracking-wider ${
                          lead.status === 'WON' ? 'bg-[#4ADE80] text-black' :
                          lead.status === 'LOST' ? 'bg-[#FF6B6B] text-white' :
                          lead.status === 'QUALIFIED' ? 'bg-[#C4B5FD] text-black' :
                          lead.status === 'CONTACTED' ? 'bg-[#FFD93D] text-black' :
                          'bg-white text-black'
                        }`}>
                          {lead.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {displayLeads.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-black/40 font-black uppercase text-xs tracking-wider">
                        No Messenger leads registered in CRM database.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white p-6 border-4 border-black neo-shadow-md space-y-6">
            <div className="flex justify-between items-center border-b-2 border-black pb-3">
              <div>
                <h2 className="text-lg font-black uppercase text-black">Upcoming Content</h2>
                <p className="text-black/60 text-xs font-bold uppercase tracking-wider font-space">Scheduled publications feed</p>
              </div>
              <Link to="/facebook-scheduler" className="text-neo-accent hover:underline text-xs font-black uppercase tracking-wider">
                Timeline →
              </Link>
            </div>

            <div className="space-y-4">
              {displayScheduled.map((post) => (
                <div key={post.id} className="p-4 border-2 border-black bg-[#FFFDF5] hover:bg-[#FFD93D]/25 transition-all flex flex-col gap-2 relative neo-shadow-sm">
                  <div className="flex justify-between items-center border-b border-black/10 pb-1">
                    <span className="text-[9px] font-black text-black uppercase bg-[#C4B5FD] px-2 py-0.5 border border-black">
                      {post.type || 'POST'}
                    </span>
                    <span className="text-[9px] text-black/60 font-black uppercase">
                      {new Date(post.time).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-black line-clamp-2">
                    {post.text}
                  </p>
                  <div className="text-[8px] text-black/50 font-black uppercase mt-1">
                    Node: {post.page || 'SYSTEM'}
                  </div>
                </div>
              ))}
              {displayScheduled.length === 0 && (
                <div className="py-12 text-center text-black/40 font-black uppercase text-xs tracking-widest">
                  No upcoming content scheduled.
                </div>
              )}
            </div>
          </div>
        </div>
        <section className="bg-white border-4 border-black neo-shadow-md p-6 space-y-6">
          <div className="flex flex-col lg:flex-row justify-between gap-4 border-b-2 border-black pb-4">
            <div>
              <div className="inline-block bg-neo-secondary text-black px-2 py-0.5 mb-2 border-2 border-black -rotate-1">
                <span className="text-[10px] font-black uppercase tracking-widest">ANALYTICS FEATURES</span>
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-black">
                Dashboard Control Panels
              </h2>
              <p className="text-black/60 text-xs font-bold uppercase tracking-wider">
                Facebook, scheduler, generations, planning, leads, and messages in one page.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {featureTabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 font-black uppercase text-xs tracking-widest border-2 border-black transition-all ${
                    activeTab === tab
                      ? 'bg-black text-white shadow-[4px_4px_0px_0px_rgba(255,217,61,1)]'
                      : 'bg-[#FFFDF5] text-black hover:bg-[#FFD93D] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </section>

        {activeTab === 'OVERVIEW' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureKpiCard title="Scheduled Posts" value={formatNumber(schedulerTotal)} period={`${formatNumber(schedulerPending)} pending`} icon="fas fa-calendar-check" iconBgColor="bg-neo-black" isLoading={isRefreshingAuxData} />
            <FeatureKpiCard title="Generated Canvases" value={formatNumber(canvasesTotal)} period={`${formatNumber(canvasesReady)} ready for review/use`} icon="fas fa-layer-group" iconBgColor="bg-neo-accent" isLoading={isRefreshingAuxData} />
            <FeatureKpiCard title="Plan Files" value={formatNumber(planningFilesTotal)} period="Files inside planning folders" icon="fas fa-file-alt" iconBgColor="bg-neo-secondary" isLoading={isRefreshingAuxData} />
            <FeatureKpiCard title="Message Threads" value={formatNumber(messagesTotal)} period="Conversation state records" icon="fas fa-comments" iconBgColor="bg-neo-muted" isLoading={isRefreshingAuxData} />
          </div>
        )}

        {activeTab === 'FACEBOOK' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <FeatureKpiCard title="Reach" value={formatNumber(kpiData.reach)} period="Disabled until valid insight metric is confirmed" icon="fas fa-bullseye" iconBgColor="bg-neo-black" isLoading={isLoadingAnalytics && kpiData.reach === null} />
              <FeatureKpiCard title="Engagement" value={formatNumber(kpiData.engagement)} period="Reactions + comments + shares" icon="fas fa-heart" iconBgColor="bg-neo-accent" isLoading={isLoadingAnalytics && kpiData.engagement === null} />
              <FeatureKpiCard title="Posts" value={formatNumber(kpiData.postsPublished)} period="Published in last 30 days" icon="fas fa-paper-plane" iconBgColor="bg-neo-secondary" isLoading={isLoadingAnalytics && kpiData.postsPublished === null} />
              <FeatureKpiCard title="Followers" value={formatNumber(kpiData.followers)} period={followerGrowth} icon="fas fa-users" iconBgColor="bg-neo-muted" isLoading={isLoadingAnalytics && kpiData.followers === null} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 border-4 border-black bg-white neo-shadow-md p-6">
                <div className="border-b-2 border-black pb-3 mb-4">
                  <h3 className="text-lg font-black uppercase text-black">Engagement History</h3>
                  <p className="text-black/60 text-xs font-bold uppercase tracking-wider">Daily reactions, comments, and shares</p>
                </div>
                <div className="h-[400px] bg-black p-8 border-2 border-black relative overflow-hidden" aria-live="polite">
                  <div className="absolute inset-0 bg-halftone opacity-10 pointer-events-none"></div>
                  <div className="relative z-10 w-full h-full">
                    {renderEngagementChart()}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 border-4 border-black bg-white neo-shadow-md p-6">
                <div className="border-b-2 border-black pb-3 mb-4">
                  <h3 className="text-lg font-black uppercase text-black">Top Performing Posts</h3>
                  <p className="text-black/60 text-xs font-bold uppercase tracking-wider">Ranked by reactions, comments, and shares</p>
                </div>

                <div className="space-y-5 max-h-[600px] overflow-y-auto pr-2 scrollbar-hide">
                  {isLoadingAnalytics && topPosts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="w-10 h-10 border-2 border-black bg-neo-accent animate-spin"></div>
                    </div>
                  ) : topPosts.length > 0 ? (
                    topPosts.map((post: any) => {
                      const postImageUrl = getPostImageUrl(post);
                      const postEngagement = getPostEngagement(post);
                      const reactions = post?.reactions?.summary?.total_count || 0;
                      const comments = post?.comments?.summary?.total_count || 0;
                      const shares = post?.shares?.count || 0;

                      return (
                        <div key={post.id} className="p-5 bg-[#FFFDF5] border-2 border-black hover:bg-white transition-colors group relative overflow-hidden">
                          {postImageUrl && (
                            <img
                              src={postImageUrl}
                              alt="Post attachment"
                              className="w-full h-36 object-cover border-2 border-black mb-4 grayscale group-hover:grayscale-0 transition-all"
                            />
                          )}

                          <p className="text-xs font-bold text-black mb-4 line-clamp-3 uppercase tracking-tight">
                            {post.message || 'NO CAPTION AVAILABLE'}
                          </p>

                          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-black/40 mb-4">
                            <span>
                              {post.created_time ? new Date(post.created_time).toLocaleDateString() : 'NO DATE'}
                            </span>
                            <span>
                              <i className="fas fa-heart text-neo-accent mr-1"></i>
                              {postEngagement.toLocaleString()}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="border border-black bg-white p-2 text-center">
                              <p className="text-[9px] font-black uppercase text-black/40">React</p>
                              <p className="text-sm font-black text-black">{reactions.toLocaleString()}</p>
                            </div>
                            <div className="border border-black bg-white p-2 text-center">
                              <p className="text-[9px] font-black uppercase text-black/40">Comment</p>
                              <p className="text-sm font-black text-black">{comments.toLocaleString()}</p>
                            </div>
                            <div className="border border-black bg-white p-2 text-center">
                              <p className="text-[9px] font-black uppercase text-black/40">Share</p>
                              <p className="text-sm font-black text-black">{shares.toLocaleString()}</p>
                            </div>
                          </div>

                          {post.permalink_url && (
                            <a
                              href={post.permalink_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full text-center py-2 border-2 border-black bg-black text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-neo-accent transition-colors"
                            >
                              Open Post
                            </a>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-20 opacity-30">
                      <i className="fas fa-ghost text-6xl mb-4"></i>
                      <p className="font-black uppercase tracking-widest text-xs">No posts found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'SCHEDULER' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureKpiCard title="Total Scheduled" value={formatNumber(schedulerTotal)} icon="fas fa-calendar-check" iconBgColor="bg-neo-black" isLoading={isRefreshingAuxData} />
            <FeatureKpiCard title="Pending" value={formatNumber(schedulerPending)} icon="fas fa-clock" iconBgColor="bg-neo-accent" isLoading={isRefreshingAuxData} />
            <FeatureKpiCard title="Completed" value={formatNumber(Math.max(schedulerTotal - schedulerPending, 0))} icon="fas fa-check-double" iconBgColor="bg-neo-secondary" isLoading={isRefreshingAuxData} />
          </div>
        )}

        {activeTab === 'GENERATIONS' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureKpiCard title="Total Canvases" value={formatNumber(canvasesTotal)} icon="fas fa-layer-group" iconBgColor="bg-neo-black" isLoading={isRefreshingAuxData} />
              <FeatureKpiCard title="Draft Status" value={formatNumber(canvasesDraft)} icon="fas fa-pencil-ruler" iconBgColor="bg-neo-muted" isLoading={isRefreshingAuxData} />
              <FeatureKpiCard title="Ready Status" value={formatNumber(canvasesReady)} icon="fas fa-check-circle" iconBgColor="bg-neo-secondary" isLoading={isRefreshingAuxData} />
            </div>

            <section className="bg-white border-4 border-black neo-shadow-md p-6 space-y-6">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 border-b-2 border-black pb-4">
                <div>
                  <div className="inline-block bg-neo-muted text-black px-2 py-0.5 mb-2 border-2 border-black rotate-1">
                    <span className="text-[10px] font-black uppercase tracking-widest">CONTROL CENTER</span>
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-black">
                    Content <span className="text-neo-accent">Canvases</span>
                  </h3>
                  <p className="text-black/60 text-xs font-bold uppercase tracking-wider">
                    Original canvas review board with filtering, approvals, revisions, posting, editing, and deletion.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                  <div className="flex items-center gap-3 bg-[#FFFDF5] border-2 border-black px-4 py-3 neo-shadow-sm">
                    <i className="fas fa-filter text-neo-accent"></i>
                    <Select
                      id="dashboardCanvasStatusFilter"
                      value={canvasFilter}
                      onChange={(event) => setCanvasFilter(event.target.value as CanvasStatus | 'all')}
                      options={canvasFilterOptions}
                      wrapperClassName="mb-0 min-w-[220px]"
                      disabled={operationInProgress}
                    />
                  </div>

                  {currentUser?.role === UserRole.CREATIVE && (
                    <Link to="/generate" className="w-full sm:w-auto">
                      <Button
                        variant="primary"
                        size="md"
                        disabled={operationInProgress}
                        icon={<i className="fas fa-plus"></i>}
                        className="w-full"
                      >
                        NEW CANVAS
                      </Button>
                    </Link>
                  )}
                </div>
              </div>

              {isLoadingCanvases ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <LoadingSpinner />
                  <p className="mt-4 text-xs font-black uppercase tracking-widest text-black/50">
                    Loading canvases...
                  </p>
                </div>
              ) : filteredAndSortedCanvases.length === 0 ? (
                <div className="border-2 border-black bg-[#FFFDF5] p-16 text-center neo-shadow-sm rotate-1">
                  <i className="fas fa-folder-open text-6xl text-neo-muted mb-6"></i>
                  <p className="text-xl font-black text-neo-black uppercase tracking-tight">
                    No canvases detected.
                  </p>
                  {currentUser?.role === UserRole.CREATIVE && (
                    <p className="mt-4 text-sm font-bold text-black/60 uppercase">
                      Start with <Link to="/generate" className="text-neo-accent underline decoration-4">new canvas</Link> to proceed.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {filteredAndSortedCanvases.map((canvas) => (
                    <CanvasDisplayCard
                      key={canvas.id}
                      canvas={canvas}
                      onUpdateStatus={handleUpdateCanvasStatus}
                      onDelete={handleDeleteCanvas}
                      onOpenPostModal={handleOpenPostModal}
                      currentUserRole={currentUser?.role}
                      currentUserId={currentUser?.id}
                      isFacebookReady={isFacebookReady}
                      isProcessing={operationInProgress}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'PLANS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureKpiCard title="Total Plan Files" value={formatNumber(planningFilesTotal)} icon="fas fa-file-alt" iconBgColor="bg-neo-black" isLoading={isRefreshingAuxData} />
            <FeatureKpiCard title="Markdown Files" value="N/A" period="Requires deep scan" icon="fas fa-file-code" iconBgColor="bg-neo-muted" />
            <FeatureKpiCard title="Media / Assets" value="N/A" period="Requires deep scan" icon="fas fa-photo-video" iconBgColor="bg-neo-muted" />
          </div>
        )}

        {activeTab === 'LEADS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureKpiCard title="Total Leads" value={formatNumber(leadsTotal)} icon="fas fa-user-friends" iconBgColor="bg-neo-black" isLoading={isRefreshingAuxData} />
            <FeatureKpiCard title="New Leads" value={formatNumber(leadsNew)} icon="fas fa-user-plus" iconBgColor="bg-neo-accent" isLoading={isRefreshingAuxData} />
            <FeatureKpiCard title="Converted" value={formatNumber(leadsConverted)} period="Won + qualified leads" icon="fas fa-handshake" iconBgColor="bg-neo-secondary" isLoading={isRefreshingAuxData} />
          </div>
        )}

        {activeTab === 'MESSAGES' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <FeatureKpiCard title="Active Threads" value={formatNumber(messagesTotal)} icon="fas fa-comments" iconBgColor="bg-neo-black" isLoading={isRefreshingAuxData} />
            <FeatureKpiCard title="AI Replies" value="N/A" period="Requires metrics aggregate" icon="fas fa-robot" iconBgColor="bg-neo-accent" />
          </div>
        )}
        <footer className="text-center pb-4">
          <div className="inline-block px-8 py-4 bg-neo-muted border-2 border-black -rotate-1">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-black/60">
              CORE_SYSTEM_LOG // DASHBOARD_ANALYTICS_MERGED // GRAPH_API_SAFE_MODE
            </p>
          </div>
        </footer>
      </div>

      {selectedCanvasForPost && (
        <PostToFacebookModal
          isOpen={isPostModalOpen}
          onClose={() => {
            setIsPostModalOpen(false);
            setPostToFacebookError(null);
          }}
          canvas={selectedCanvasForPost}
          onConfirmPost={handleConfirmPostToFacebook}
          isPosting={isPostingToFacebook}
          postError={postToFacebookError}
          postSuccessMessage={postToFacebookSuccess}
          onCloseSuccess={() => setPostToFacebookSuccess(null)}
        />
      )}
    </div>
  );
};

export default DashboardPage;
