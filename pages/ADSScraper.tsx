import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type DataSource = 'meta' | 'google_trends' | 'tiktok_ads' | 'reddit';
type BrowserState = 'idle' | 'launching' | 'navigating' | 'extracting' | 'analyzing' | 'complete' | 'error';
type LogType = 'info' | 'success' | 'command' | 'error' | 'network';

enum Platform {
  ALL = 'all',
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  MESSENGER = 'messenger',
  AUDIENCE_NETWORK = 'audience_network',
}

enum AdStatus {
  ACTIVE = 'active',
  ALL = 'all',
  INACTIVE = 'inactive',
}

interface SearchFilters {
  niche: string;
  pageUrl: string;
  platform: Platform;
  status: AdStatus;
  country: string;
  resultCount: number;
  timeframe: string;
  impressionDate: string;
  sources: Record<DataSource, boolean>;
  useAI: boolean;
  headless: boolean;
}

interface ScraperLog {
  message: string;
  timestamp: string;
  type: LogType;
}

interface AdMedia {
  type?: 'image' | 'video' | string;
  src?: string;
  poster?: string;
  sources?: string[];
}

interface AdData {
  id: string;
  brandName: string;
  brandLogo?: string;
  adCopy?: string;
  caption?: string;
  imageUrl?: string;
  media?: AdMedia;
  platforms: string[];
  status: string;
  startDate?: string;
  activeTime?: string;
  impressionCount: number;
  impressionText?: string;
  impressionCountText?: string;
  cta?: string;
  advertiserUrl?: string;
  source?: string;
}

interface TikTokContentData {
  id: string;
  brandName: string;
  adCopy: string;
  imageUrl?: string;
  videoUrl?: string;
  advertiserUrl?: string;
  firstShown?: string;
  lastShown?: string;
  uniqueUsersSeen?: string;
  startDate?: string;
  activeTime?: string;
  metrics: Record<string, number | string>;
  source?: string;
}

interface RedditPostData {
  id: string;
  title: string;
  subreddit?: string;
  author?: string;
  selfText?: string;
  imageUrl?: string;
  thumbnail?: string;
  flair?: string;
  domain?: string;
  url?: string;
  permalink?: string;
  score: number;
  numComments: number;
  upvoteRatio?: number;
  createdUtc?: number;
  metrics?: Record<string, number | string>;
  source?: string;
}

interface TrendPoint {
  date?: string;
  formattedTime?: string;
  value: number;
}

interface GoogleTrendData {
  keyword: string;
  averageInterest: number;
  peakInterest: number;
  latestInterest: number;
  timeline: TrendPoint[];
  risingQueries: string[];
  topQueries: string[];
  url?: string;
}

interface MarketKpis {
  datasetCount?: number;
  metaAdsCount?: number;
  tiktokContentCount?: number;
  redditPostsCount?: number;
  totalImpressions?: number;
  averageImpressions?: number;
  topImpressionCount?: number;
  trendAverageInterest?: number;
  trendLatestInterest?: number;
  trendMomentum?: number;
  contentDiversityScore?: number;
  opportunityScore?: number;
  estimatedEngagementSignals?: number;
  redditEngagementSignals?: number;
  [key: string]: number | string | undefined;
}

interface MarketAnalysis {
  detectedNiche?: string;
  marketSummary?: string;
  winningAds?: string[];
  winningContent?: string[];
  contentTypes?: string[];
  structuralPosting?: string[];
  demographics?: string[];
  timeAnalysis?: string[];
  recommendations?: string[];
  kpis?: MarketKpis;
  aiProvider?: string;
  aiError?: string;
}

interface ResearchResponse {
  success?: boolean;
  detectedNiche?: string;
  metaAds?: AdData[];
  ads?: AdData[];
  tiktokAds?: TikTokContentData[];
  redditPosts?: RedditPostData[];
  redditDiscussions?: RedditPostData[];
  googleTrends?: GoogleTrendData | null;
  kpis?: MarketKpis;
  marketAnalysis?: MarketAnalysis;
  analysisText?: string;
  warnings?: string[];
  query?: Record<string, unknown>;
}

interface NeoCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const API_ENDPOINT = 'http://localhost:3001/api/market-research';
const FALLBACK_IMAGE = 'https://via.placeholder.com/800x600/ffffff/111111?text=No+Creative+Preview';

const sourceLabels: Record<DataSource, string> = {
  meta: 'Meta Ads Library',
  google_trends: 'Google Trends',
  tiktok_ads: 'TikTok Ads Library',
  reddit: 'Reddit Search',
};

const platformLabels: Record<Platform, string> = {
  [Platform.ALL]: 'All Platforms',
  [Platform.FACEBOOK]: 'Facebook',
  [Platform.INSTAGRAM]: 'Instagram',
  [Platform.MESSENGER]: 'Messenger',
  [Platform.AUDIENCE_NETWORK]: 'Audience Network',
};

const statusLabels: Record<AdStatus, string> = {
  [AdStatus.ACTIVE]: 'Active Ads',
  [AdStatus.ALL]: 'All History',
  [AdStatus.INACTIVE]: 'Inactive Only',
};

const countryOptions = ['US', 'PH', 'GB', 'CA', 'AU', 'SG', 'MY', 'ID', 'TH', 'VN', 'JP', 'KR'];

const timeframeOptions = [
  { value: '7d', label: 'Past 7 days' },
  { value: '30d', label: 'Past 30 days' },
  { value: '90d', label: 'Past 90 days' },
  { value: '12m', label: 'Past 12 months' },
  { value: '5y', label: 'Past 5 years' },
];

const sleep = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));

const createTimestamp = () => {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour12: false });
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${time}.${ms}`;
};

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
};

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return fallback;

  const normalized = value.toLowerCase().replace(/,/g, '').trim();
  const match = normalized.match(/[-+]?\d*\.?\d+/);
  if (!match) return fallback;

  const base = Number(match[0]);
  if (!Number.isFinite(base)) return fallback;
  if (normalized.includes('m')) return Math.round(base * 1_000_000);
  if (normalized.includes('k')) return Math.round(base * 1_000);
  if (normalized.includes('%')) return Math.round(base);
  return Math.round(base);
};

const normalizePlatforms = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    const items = value.map(item => asString(item)).filter(Boolean);
    return items.length ? items : ['Meta'];
  }

  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  return ['Meta'];
};

const getCreativeUrl = (ad: Record<string, unknown>): string => {
  const media = ad.media as AdMedia | undefined;
  return (
    asString(media?.poster) ||
    asString(media?.src) ||
    asString(ad.imageUrl) ||
    asString(ad.image_url) ||
    asString(ad.thumbnailUrl) ||
    asString(ad.thumbnail_url) ||
    asString(ad.brandLogo) ||
    asString(ad.brand_logo) ||
    FALLBACK_IMAGE
  );
};

const normalizeAd = (rawAd: unknown, index: number): AdData => {
  const ad = (rawAd && typeof rawAd === 'object' ? rawAd : {}) as Record<string, unknown>;
  const media = ad.media && typeof ad.media === 'object' ? (ad.media as AdMedia) : undefined;
  const impressionText = asString(ad.impressionText) || asString(ad.impressionCountText) || asString(ad.impressions);

  return {
    id: asString(ad.id, `ad-${index + 1}`),
    brandName: asString(ad.brandName) || asString(ad.pageName) || asString(ad.advertiserName, 'Unknown Advertiser'),
    brandLogo: asString(ad.brandLogo) || asString(ad.logoUrl) || asString(ad.pageProfilePictureUrl),
    adCopy: asString(ad.adCopy) || asString(ad.body) || asString(ad.text) || asString(ad.caption),
    caption: asString(ad.caption),
    imageUrl: getCreativeUrl(ad),
    media,
    platforms: normalizePlatforms(ad.platforms || ad.publisherPlatforms || ad.source),
    status: asString(ad.status, 'ACTIVE').toUpperCase(),
    startDate: asString(ad.startDate) || asString(ad.startedRunningOn) || asString(ad.launchDate),
    activeTime: asString(ad.activeTime) || asString(ad.duration),
    impressionCount: toNumber(ad.impressionCount, toNumber(ad.impressions, toNumber(impressionText, 0))),
    impressionText,
    impressionCountText: asString(ad.impressionCountText) || impressionText,
    cta: asString(ad.cta) || asString(ad.callToAction),
    advertiserUrl: asString(ad.advertiserUrl) || asString(ad.url) || asString(ad.libraryUrl),
    source: asString(ad.source, 'Meta Ads Library'),
  };
};

const normalizeTikTokContent = (rawItem: unknown, index: number): TikTokContentData => {
  const item = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
  const metrics = item.metrics && typeof item.metrics === 'object' ? item.metrics as Record<string, number | string> : {};

  return {
    id: asString(item.id, `tiktok-${index + 1}`),
    brandName: asString(item.brandName) || asString(item.advertiserName) || asString(item.authorName, 'TikTok Advertiser'),
    adCopy: asString(item.adCopy) || asString(item.caption) || asString(item.text) || asString(item.description),
    imageUrl: asString(item.imageUrl) || asString(item.thumbnailUrl) || asString(item.coverUrl),
    videoUrl: asString(item.videoUrl) || asString(item.url),
    advertiserUrl: asString(item.advertiserUrl) || asString(item.url),
    firstShown: asString(item.firstShown),
    lastShown: asString(item.lastShown),
    uniqueUsersSeen: asString(item.uniqueUsersSeen),
    startDate: asString(item.startDate),
    activeTime: asString(item.activeTime),
    metrics,
    source: asString(item.source, 'TikTok Ads Library'),
  };
};

const normalizeRedditPost = (rawItem: unknown, index: number): RedditPostData => {
  const item = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
  const metrics = item.metrics && typeof item.metrics === 'object' ? item.metrics as Record<string, number | string> : {};

  return {
    id: asString(item.id, `reddit-${index + 1}`),
    title: asString(item.title, 'Untitled Reddit post'),
    subreddit: asString(item.subreddit),
    author: asString(item.author),
    selfText: asString(item.selfText) || asString(item.text),
    imageUrl: asString(item.imageUrl),
    thumbnail: asString(item.thumbnail),
    flair: asString(item.flair),
    domain: asString(item.domain),
    url: asString(item.url),
    permalink: asString(item.permalink) || asString(item.url),
    score: toNumber(item.score, toNumber(metrics.Score, 0)),
    numComments: toNumber(item.numComments, toNumber(metrics.Comments, 0)),
    upvoteRatio: toNumber(item.upvoteRatio, toNumber(metrics.UpvoteRatio, 0)),
    createdUtc: toNumber(item.createdUtc, 0),
    metrics,
    source: asString(item.source, 'Reddit Search'),
  };
};

const normalizeTrend = (value: unknown): GoogleTrendData | null => {
  if (!value || typeof value !== 'object') return null;
  const trend = value as Record<string, unknown>;
  const timeline = Array.isArray(trend.timeline)
    ? trend.timeline.map(item => {
        const point = item as Record<string, unknown>;
        return {
          date: asString(point.date),
          formattedTime: asString(point.formattedTime) || asString(point.time),
          value: toNumber(point.value, 0),
        };
      })
    : [];

  return {
    keyword: asString(trend.keyword),
    averageInterest: toNumber(trend.averageInterest, 0),
    peakInterest: toNumber(trend.peakInterest, 0),
    latestInterest: toNumber(trend.latestInterest, 0),
    timeline,
    risingQueries: Array.isArray(trend.risingQueries) ? trend.risingQueries.map(item => asString(item)).filter(Boolean) : [],
    topQueries: Array.isArray(trend.topQueries) ? trend.topQueries.map(item => asString(item)).filter(Boolean) : [],
    url: asString(trend.url),
  };
};

const formatNumber = (value?: number | string) => {
  const numeric = typeof value === 'number' ? value : toNumber(value, 0);
  return new Intl.NumberFormat().format(numeric || 0);
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'Unexpected scraper error.';
};

const readArray = <T,>(payload: unknown, keys: string[], normalizer: (item: unknown, index: number) => T): T[] => {
  if (Array.isArray(payload)) return payload.map(normalizer);
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;

  for (const key of keys) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).map(normalizer);
  }

  return [];
};

const buildMetaAdsUrl = (filters: SearchFilters) => {
  const params = new URLSearchParams({
    active_status: filters.status,
    ad_type: 'all',
    country: filters.country,
    q: filters.niche || filters.pageUrl || '',
    search_type: 'keyword_unordered',
  });

  return `https://www.facebook.com/ads/library/?${params.toString()}`;
};

const NeoCard: React.FC<NeoCardProps> = ({ title, children, className = '' }) => (
  <section className={`relative bg-white neo-border neo-shadow-sm ${className}`}>
    {title && (
      <div className="absolute -top-3 left-5 bg-neo-secondary text-neo-black px-3 py-1 neo-border-sm -rotate-1">
        <span className="text-[10px] font-black uppercase tracking-[0.22em]">{title}</span>
      </div>
    )}
    <div className={title ? 'pt-7' : ''}>{children}</div>
  </section>
);

const ScraperTerminal: React.FC<{ logs: ScraperLog[] }> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="h-full min-h-[320px] overflow-y-auto bg-neo-black p-5 font-mono text-[11px] text-white neo-border-sm">
      {logs.length === 0 ? (
        <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 text-center opacity-40">
          <div className="text-4xl">⌁</div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em]">Awaiting research run</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log, index) => {
            const colorClass =
              log.type === 'command'
                ? 'text-neo-secondary'
                : log.type === 'success'
                  ? 'text-emerald-300'
                  : log.type === 'network'
                    ? 'text-sky-300'
                    : log.type === 'error'
                      ? 'text-rose-300'
                      : 'text-zinc-300';

            return (
              <div key={`${log.timestamp}-${index}`} className="flex gap-3 leading-relaxed">
                <span className="shrink-0 select-none text-[9px] font-black text-zinc-500">[{log.timestamp}]</span>
                <span className={`break-words font-bold ${colorClass}`}>
                  {log.type === 'command' && <span className="mr-2 text-neo-accent">❯</span>}
                  {log.type === 'error' && <span className="mr-2 text-rose-400">FAIL</span>}
                  {log.message}
                </span>
              </div>
            );
          })}
          <div ref={endRef} className="h-4" />
        </div>
      )}
    </div>
  );
};

const ProgressMonitor: React.FC<{
  state: BrowserState;
  progress: number;
  filters: SearchFilters;
  metaCount: number;
  tiktokCount: number;
  redditCount: number;
  hasTrends: boolean;
  loading: boolean;
}> = ({ state, progress, filters, metaCount, tiktokCount, redditCount, hasTrends, loading }) => {
  const metaUrl = buildMetaAdsUrl(filters);
  const totalSources = [metaCount > 0, tiktokCount > 0, redditCount > 0, hasTrends].filter(Boolean).length;

  return (
    <NeoCard title="RESEARCH_MONITOR" className="h-full bg-neo-muted p-5 md:p-6 rotate-1">
      <div className="flex h-full min-h-[320px] flex-col overflow-hidden neo-border-sm bg-white">
        <div className="flex items-center gap-3 border-b-4 border-neo-black bg-neo-black px-4 py-3 text-white">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-400" />
            <span className="h-3 w-3 rounded-full bg-amber-300" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1 truncate rounded bg-white px-3 py-1 font-mono text-[10px] font-bold text-neo-black">
            {metaUrl}
          </div>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-8 text-center">
          <div className="absolute inset-0 bg-halftone opacity-5" />

          {loading ? (
            <div className="relative z-10 w-full max-w-md space-y-6">
              <p className="text-xs font-black uppercase tracking-[0.35em] text-neo-accent">Collecting market signals</p>
              <div className="h-5 overflow-hidden neo-border-sm bg-white">
                <div className="h-full bg-neo-accent transition-all duration-700" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neo-black">
                {state.replace('_', ' ')} // {progress}%
              </p>
            </div>
          ) : metaCount > 0 || tiktokCount > 0 || redditCount > 0 || hasTrends ? (
            <div className="relative z-10 space-y-5">
              <div className="mx-auto flex h-20 w-20 items-center justify-center bg-emerald-300 neo-border rotate-3">
                <span className="text-4xl font-black text-neo-black">✓</span>
              </div>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter text-neo-black">Research Finished</h2>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-neo-accent">
                  {totalSources} source group{totalSources === 1 ? '' : 's'} returned data
                </p>
              </div>
            </div>
          ) : (
            <div className="relative z-10 space-y-5 opacity-70">
              <div className="mx-auto flex h-20 w-20 items-center justify-center bg-white neo-border -rotate-3">
                <span className="text-4xl font-black text-neo-black">⌕</span>
              </div>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-neo-black">System ready for market research</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-between gap-3 border-t-4 border-neo-black bg-neo-secondary px-4 py-2 font-mono text-[10px] font-black uppercase text-neo-black">
          <span>STATE: {state.toUpperCase()}</span>
          <span>COUNTRY: {filters.country}</span>
          <span>AI: {filters.useAI ? 'SAVED_SETTINGS' : 'LOCAL_FALLBACK'}</span>
        </div>
      </div>
    </NeoCard>
  );
};

const MetricCard: React.FC<{ label: string; value: string; accent?: boolean; hint?: string }> = ({ label, value, accent = false, hint }) => (
  <div className={`p-5 neo-border-sm ${accent ? 'bg-neo-accent text-white' : 'bg-white text-neo-black'}`}>
    <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-70">{label}</p>
    <p className="mt-2 text-3xl font-black uppercase tracking-tighter">{value}</p>
    {hint && <p className="mt-2 text-[10px] font-bold uppercase tracking-wider opacity-70">{hint}</p>}
  </div>
);

const SourceToggle: React.FC<{
  source: DataSource;
  enabled: boolean;
  onToggle: () => void;
}> = ({ source, enabled, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`p-4 text-left neo-border-sm transition-transform active:translate-y-1 ${enabled ? 'bg-neo-secondary text-neo-black' : 'bg-white text-neo-black/50'}`}
  >
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-black uppercase tracking-tight">{sourceLabels[source]}</span>
      <span className="text-[10px] font-black uppercase tracking-widest">{enabled ? 'ON' : 'OFF'}</span>
    </div>
  </button>
);

const AnalysisList: React.FC<{ title: string; items?: string[] }> = ({ title, items = [] }) => (
  <div className="bg-neo-muted p-5 neo-border-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-neo-accent">{title}</p>
    {items.length ? (
      <ul className="mt-4 space-y-3">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="text-sm font-bold leading-relaxed text-neo-black">
            <span className="mr-2 font-black">•</span>{item}
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-4 text-sm font-bold text-neo-black/50">No signal detected yet.</p>
    )}
  </div>
);

const InsightsPanel: React.FC<{
  response: ResearchResponse | null;
  analysis: MarketAnalysis | null;
  analysisText: string;
}> = ({ response, analysis, analysisText }) => {
  if (!response) return null;

  const kpis = response.kpis || analysis?.kpis || {};
  const detectedNiche = response.detectedNiche || analysis?.detectedNiche || 'Not detected';

  return (
    <NeoCard title="AI_MARKET_ANALYSIS" className="bg-white p-6 md:p-8 -rotate-1">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Detected Niche" value={String(detectedNiche).slice(0, 26)} />
        <MetricCard label="Data Basis" value={formatNumber(kpis.datasetCount)} />
        <MetricCard label="Trend Interest" value={formatNumber(kpis.trendLatestInterest)} hint="latest Google Trends score" />
        <MetricCard label="Opportunity" value={formatNumber(kpis.opportunityScore)} accent hint="0 to 100 heuristic" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1 bg-neo-black p-6 text-white neo-border-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neo-secondary">Market Summary</p>
          <p className="mt-5 whitespace-pre-line text-sm font-bold leading-relaxed text-zinc-200">
            {analysis?.marketSummary || analysisText || 'No AI summary returned. Local KPIs are still available.'}
          </p>
          {analysis?.aiProvider && (
            <p className="mt-5 text-[10px] font-black uppercase tracking-widest text-zinc-400">AI Provider: {analysis.aiProvider}</p>
          )}
          {analysis?.aiError && (
            <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-rose-300">AI fallback used: {analysis.aiError}</p>
          )}
        </div>

        <div className="xl:col-span-2 grid gap-5 md:grid-cols-2">
          <AnalysisList title="Winning Ads or Content" items={[...(analysis?.winningAds || []), ...(analysis?.winningContent || [])].slice(0, 6)} />
          <AnalysisList title="Content Types" items={analysis?.contentTypes} />
          <AnalysisList title="Structural Posting" items={analysis?.structuralPosting} />
          <AnalysisList title="Demographics" items={analysis?.demographics} />
          <AnalysisList title="Time Analysis" items={analysis?.timeAnalysis} />
          <AnalysisList title="Recommended Moves" items={analysis?.recommendations} />
        </div>
      </div>
    </NeoCard>
  );
};

const TrendsPanel: React.FC<{ trend: GoogleTrendData | null }> = ({ trend }) => {
  if (!trend) return null;
  const topTimeline = [...trend.timeline].slice(-12);

  return (
    <NeoCard title="GOOGLE_TRENDS" className="bg-white p-6 md:p-8 rotate-1">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Average Interest" value={formatNumber(trend.averageInterest)} />
        <MetricCard label="Peak Interest" value={formatNumber(trend.peakInterest)} accent />
        <MetricCard label="Latest Interest" value={formatNumber(trend.latestInterest)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="bg-neo-muted p-5 neo-border-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-neo-accent">Recent Interest Points</p>
          <div className="mt-5 space-y-3">
            {topTimeline.length ? topTimeline.map((point, index) => (
              <div key={`${point.formattedTime}-${index}`} className="grid grid-cols-[120px_1fr_44px] items-center gap-3 text-xs font-black uppercase">
                <span className="truncate text-neo-black/60">{point.formattedTime || point.date || `Point ${index + 1}`}</span>
                <div className="h-3 bg-white neo-border-sm overflow-hidden">
                  <div className="h-full bg-neo-accent" style={{ width: `${Math.min(100, Math.max(0, point.value))}%` }} />
                </div>
                <span className="text-right">{point.value}</span>
              </div>
            )) : <p className="text-sm font-bold text-neo-black/50">No timeline points returned.</p>}
          </div>
        </div>

        <div className="grid gap-5">
          <AnalysisList title="Rising Queries" items={trend.risingQueries.slice(0, 8)} />
          <AnalysisList title="Top Queries" items={trend.topQueries.slice(0, 8)} />
        </div>
      </div>
    </NeoCard>
  );
};

const AdCard: React.FC<{ ad: AdData }> = ({ ad }) => {
  const contentText = ad.adCopy || ad.caption || '';
  const isVideo = Boolean(ad.media?.type === 'video' && ad.media?.src);
  const displayImage = ad.media?.poster || ad.imageUrl || ad.brandLogo || FALLBACK_IMAGE;
  const impressionDisplay = ad.impressionText || ad.impressionCountText || formatNumber(ad.impressionCount) || 'Undisclosed';

  return (
    <article className="flex h-full flex-col overflow-hidden bg-white neo-border neo-shadow-sm transition-transform duration-200 hover:-translate-y-1">
      <div className="flex items-center justify-between gap-4 border-b-4 border-neo-black bg-neo-secondary p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden bg-white neo-border-sm">
            <img
              src={ad.brandLogo || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(ad.brandName)}`}
              alt={ad.brandName}
              className="h-full w-full object-cover"
              onError={event => {
                event.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(ad.brandName)}`;
              }}
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black uppercase leading-tight tracking-tight text-neo-black">{ad.brandName}</h3>
            <p className="truncate font-mono text-[10px] font-black text-neo-black/60">ID: {ad.id}</p>
          </div>
        </div>
        <span className={`shrink-0 px-2 py-1 text-[9px] font-black uppercase tracking-widest neo-border-sm ${ad.status === 'ACTIVE' ? 'bg-emerald-300 text-neo-black' : 'bg-white text-neo-black'}`}>
          {ad.status}
        </span>
      </div>

      <div className="relative aspect-square bg-neo-black">
        {isVideo ? (
          <video src={ad.media?.src} poster={ad.media?.poster} controls className="h-full w-full object-contain" />
        ) : (
          <img
            src={displayImage}
            alt={`${ad.brandName} ad creative`}
            className="h-full w-full object-contain"
            onError={event => {
              event.currentTarget.src = FALLBACK_IMAGE;
            }}
          />
        )}

        <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-1.5">
          {ad.platforms.map((platform, index) => (
            <span key={`${platform}-${index}`} className="bg-white px-2 py-1 text-[8px] font-black uppercase tracking-widest text-neo-black neo-border-sm">
              {platform.slice(0, 2)}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 border-b-4 border-neo-black bg-neo-muted text-neo-black">
        <div className="border-r-4 border-neo-black p-3">
          <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Impressions</p>
          <p className="text-xs font-black uppercase">{impressionDisplay}</p>
        </div>
        <div className="p-3 text-right">
          <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Launched</p>
          <p className="text-xs font-black uppercase">{ad.startDate || 'Recent'}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <p className="line-clamp-5 text-sm font-bold italic leading-relaxed text-neo-black">
          {contentText ? `“${contentText}”` : 'No ad text found.'}
        </p>

        <div className="mt-auto flex items-center justify-between gap-4 border-t-4 border-neo-black pt-4">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-neo-black/50">Duration</p>
            <p className="truncate text-[11px] font-black uppercase text-neo-black">{ad.activeTime || ad.source || 'Running'}</p>
          </div>
          <a
            href={ad.advertiserUrl || `https://www.facebook.com/ads/library/?id=${encodeURIComponent(ad.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 bg-neo-accent px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white neo-border-sm transition-transform active:translate-y-0.5"
          >
            {ad.cta || 'Details'}
          </a>
        </div>
      </div>
    </article>
  );
};

const TikTokCard: React.FC<{ item: TikTokContentData }> = ({ item }) => {
  const metrics = Object.entries(item.metrics || {}).slice(0, 4);
  const hasDateDetails = Boolean(item.firstShown || item.lastShown || item.uniqueUsersSeen || item.activeTime);

  return (
    <article className="flex h-full flex-col overflow-hidden bg-white neo-border neo-shadow-sm transition-transform duration-200 hover:-translate-y-1">
      <div className="border-b-4 border-neo-black bg-neo-black p-4 text-white">
        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-neo-secondary">TikTok Signal</p>
        <h3 className="mt-2 truncate text-lg font-black uppercase tracking-tight">{item.brandName}</h3>
      </div>

      <div className="relative aspect-video bg-neo-muted">
        <img
          src={item.imageUrl || FALLBACK_IMAGE}
          alt={`${item.brandName} TikTok creative`}
          className="h-full w-full object-cover"
          onError={event => {
            event.currentTarget.src = FALLBACK_IMAGE;
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-0 border-b-4 border-neo-black">
        {metrics.length ? metrics.map(([key, value]) => (
          <div key={key} className="border-r-4 border-neo-black p-3 last:border-r-0">
            <p className="text-[8px] font-black uppercase tracking-widest text-neo-black/50">{key}</p>
            <p className="text-xs font-black uppercase text-neo-black">{String(value)}</p>
          </div>
        )) : (
          <div className="col-span-2 p-3 text-xs font-black uppercase text-neo-black/50">No public metrics found</div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {hasDateDetails && (
          <div className="mb-4 grid gap-2 bg-neo-muted p-3 text-[10px] font-black uppercase tracking-widest text-neo-black neo-border-sm">
            {item.firstShown && <p>First shown: <span className="text-neo-accent">{item.firstShown}</span></p>}
            {item.lastShown && <p>Last shown: <span className="text-neo-accent">{item.lastShown}</span></p>}
            {item.uniqueUsersSeen && <p>Unique users seen: <span className="text-neo-accent">{item.uniqueUsersSeen}</span></p>}
          </div>
        )}
        <p className="line-clamp-5 text-sm font-bold italic leading-relaxed text-neo-black">
          {item.adCopy || 'No caption or creative text found.'}
        </p>
        {item.advertiserUrl && (
          <a
            href={item.advertiserUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-block bg-neo-accent px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest text-white neo-border-sm"
          >
            Open Source
          </a>
        )}
      </div>
    </article>
  );
};


const RedditCard: React.FC<{ post: RedditPostData }> = ({ post }) => {
  const createdDate = post.createdUtc ? new Date(post.createdUtc * 1000).toLocaleDateString() : '';

  return (
    <article className="flex h-full flex-col overflow-hidden bg-white neo-border neo-shadow-sm transition-transform duration-200 hover:-translate-y-1">
      <div className="border-b-4 border-neo-black bg-orange-200 p-4 text-neo-black">
        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-neo-accent">Reddit Signal</p>
        <h3 className="mt-2 line-clamp-2 text-lg font-black uppercase tracking-tight">{post.title}</h3>
        <p className="mt-2 text-[10px] font-black uppercase tracking-widest opacity-70">
          {post.subreddit || 'Reddit'} {post.author ? `// u/${post.author}` : ''}
        </p>
        {(post.flair || post.domain) && (
          <p className="mt-2 text-[9px] font-black uppercase tracking-widest opacity-60">
            {[post.flair, post.domain].filter(Boolean).join(' // ')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 border-b-4 border-neo-black bg-neo-muted text-neo-black">
        <div className="border-r-4 border-neo-black p-3">
          <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Score</p>
          <p className="text-xs font-black uppercase">{formatNumber(post.score)}</p>
        </div>
        <div className="border-r-4 border-neo-black p-3">
          <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Comments</p>
          <p className="text-xs font-black uppercase">{formatNumber(post.numComments)}</p>
        </div>
        <div className="p-3">
          <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Date</p>
          <p className="text-xs font-black uppercase">{createdDate || 'N/A'}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        {(post.imageUrl || post.thumbnail) && (
          <div className="mb-4 aspect-video overflow-hidden bg-neo-muted neo-border-sm">
            <img
              src={post.imageUrl || post.thumbnail}
              alt={post.title}
              className="h-full w-full object-cover"
              onError={event => {
                event.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}
        <p className="line-clamp-6 text-sm font-bold italic leading-relaxed text-neo-black">
          {post.selfText || 'No body text available. Use the thread title and comments as the discussion signal.'}
        </p>
        {(post.permalink || post.url) && (
          <a
            href={post.permalink || post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-block bg-neo-black px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest text-white neo-border-sm"
          >
            Open Thread
          </a>
        )}
      </div>
    </article>
  );
};

const ADSScraperPage: React.FC = () => {
  const [filters, setFilters] = useState<SearchFilters>({
    niche: 'Fitness Supplements',
    pageUrl: '',
    platform: Platform.ALL,
    status: AdStatus.ACTIVE,
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
  });

  const [apiEndpoint, setApiEndpoint] = useState(API_ENDPOINT);
  const [response, setResponse] = useState<ResearchResponse | null>(null);
  const [metaAds, setMetaAds] = useState<AdData[]>([]);
  const [tiktokAds, setTiktokAds] = useState<TikTokContentData[]>([]);
  const [redditPosts, setRedditPosts] = useState<RedditPostData[]>([]);
  const [googleTrends, setGoogleTrends] = useState<GoogleTrendData | null>(null);
  const [logs, setLogs] = useState<ScraperLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserState, setBrowserState] = useState<BrowserState>('idle');
  const [progress, setProgress] = useState(0);

  const addLog = useCallback((message: string, type: LogType = 'info') => {
    setLogs(previousLogs => [
      ...previousLogs,
      {
        message,
        timestamp: createTimestamp(),
        type,
      },
    ]);
  }, []);

  const updateFilter = <Key extends keyof SearchFilters>(key: Key, value: SearchFilters[Key]) => {
    setFilters(previousFilters => ({ ...previousFilters, [key]: value }));
  };

  const toggleSource = (source: DataSource) => {
    setFilters(previousFilters => ({
      ...previousFilters,
      sources: {
        ...previousFilters.sources,
        [source]: !previousFilters.sources[source],
      },
    }));
  };

  const selectedSources = useMemo(
    () => (Object.entries(filters.sources) as [DataSource, boolean][]).filter(([, enabled]) => enabled).map(([source]) => source),
    [filters.sources]
  );

  const handleStartResearch = useCallback(async () => {
    if (loading) return;

    const trimmedNiche = filters.niche.trim();
    const trimmedPageUrl = filters.pageUrl.trim();

    if (!trimmedNiche && !trimmedPageUrl) {
      setError('Enter a niche, page name, or page URL before starting the market research run.');
      return;
    }

    if (selectedSources.length === 0) {
      setError('Select at least one source: Meta, Google Trends, TikTok, or Reddit.');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);
    setMetaAds([]);
    setTiktokAds([]);
    setRedditPosts([]);
    setGoogleTrends(null);
    setLogs([]);
    setBrowserState('launching');
    setProgress(8);
    addLog('Connecting to local market research engine...', 'command');
    addLog(`Source plan: ${selectedSources.map(source => sourceLabels[source]).join(', ')}`, 'info');

    try {
      await sleep(250);
      setBrowserState('navigating');
      setProgress(28);
      addLog(`POST ${apiEndpoint}`, 'network');

      const payloadBody = {
        ...filters,
        niche: trimmedNiche,
        pageUrl: trimmedPageUrl,
        sources: selectedSources,
        maxAds: filters.resultCount,
        maxItems: filters.resultCount,
      };

      const fetchResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody),
      });

      const payload = await fetchResponse.json().catch(() => null) as ResearchResponse | null;

      if (!fetchResponse.ok) {
        const responseError = payload && typeof payload === 'object' ? asString((payload as Record<string, unknown>).error) || asString((payload as Record<string, unknown>).message) : '';
        throw new Error(responseError || `Research server returned HTTP ${fetchResponse.status}.`);
      }

      if (payload && typeof payload === 'object' && payload.success === false) {
        throw new Error(asString((payload as Record<string, unknown>).error, 'Market research failed to return results.'));
      }

      setBrowserState('extracting');
      setProgress(68);
      addLog('Normalizing cross-platform research payload...', 'command');

      const normalizedMetaAds = readArray(payload, ['metaAds', 'ads'], normalizeAd).slice(0, filters.resultCount);
      const normalizedTikTokAds = readArray(payload, ['tiktokAds', 'tiktokContent', 'contents'], normalizeTikTokContent).slice(0, filters.resultCount);
      const normalizedRedditPosts = readArray(payload, ['redditPosts', 'redditDiscussions'], normalizeRedditPost).slice(0, filters.resultCount);
      const normalizedTrends = normalizeTrend(payload?.googleTrends);

      setResponse(payload || null);
      setMetaAds(normalizedMetaAds);
      setTiktokAds(normalizedTikTokAds);
      setRedditPosts(normalizedRedditPosts);
      setGoogleTrends(normalizedTrends);

      await sleep(250);
      setBrowserState('analyzing');
      setProgress(88);
      addLog(`Parsed ${normalizedMetaAds.length} Meta ad records.`, normalizedMetaAds.length ? 'success' : 'info');
      addLog(`Parsed ${normalizedTikTokAds.length} TikTok content records.`, normalizedTikTokAds.length ? 'success' : 'info');
      addLog(`Parsed ${normalizedRedditPosts.length} Reddit discussion records.`, normalizedRedditPosts.length ? 'success' : 'info');
      addLog(normalizedTrends ? 'Google Trends signal loaded.' : 'No Google Trends timeline returned.', normalizedTrends ? 'success' : 'info');

      if (payload?.marketAnalysis?.aiProvider) {
        addLog(`AI analysis used saved settings provider: ${payload.marketAnalysis.aiProvider}`, 'success');
      } else if (payload?.marketAnalysis?.aiError) {
        addLog(`AI fallback used: ${payload.marketAnalysis.aiError}`, 'error');
      } else {
        addLog('Local market analysis completed.', 'success');
      }

      if (payload?.warnings?.length) {
        payload.warnings.forEach(warning => addLog(warning, 'error'));
      }

      setBrowserState('complete');
      setProgress(100);
      addLog('Market research report ready.', 'success');
    } catch (caughtError) {
      const message = getErrorMessage(caughtError);
      setBrowserState('error');
      setProgress(100);
      addLog(`Fatal error: ${message}`, 'error');
      setError(message === 'Failed to fetch' ? 'Market research backend was not found. Check the local server, port 3001, and CORS settings.' : message);
    } finally {
      setLoading(false);
    }
  }, [addLog, apiEndpoint, filters, loading, selectedSources]);

  const clearResults = () => {
    setResponse(null);
    setMetaAds([]);
    setTiktokAds([]);
    setRedditPosts([]);
    setGoogleTrends(null);
    setLogs([]);
    setError(null);
    setBrowserState('idle');
    setProgress(0);
  };

  const totalImpressions = useMemo(() => metaAds.reduce((sum, ad) => sum + ad.impressionCount, 0), [metaAds]);
  const analysis = response?.marketAnalysis || null;
  const kpis = response?.kpis || analysis?.kpis || {};
  const hasAnyResults = metaAds.length > 0 || tiktokAds.length > 0 || redditPosts.length > 0 || Boolean(googleTrends) || Boolean(response?.marketAnalysis);

  return (
    <div className="min-h-screen bg-neo-bg p-5 font-space text-neo-black md:p-8 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-halftone opacity-5" />

      <header className="relative z-10 mx-auto mb-10 max-w-7xl text-center md:mb-14">
        <div className="mb-4 inline-block bg-neo-secondary px-4 py-1 text-neo-black neo-border-sm -rotate-2">
          <span className="text-xs font-black uppercase tracking-[0.3em]">ADS_MARKET_RESEARCH_CONSOLE</span>
        </div>
        <h1 className="text-5xl font-black uppercase leading-none tracking-tighter text-neo-black md:text-8xl">
          AdPulse <span className="text-neo-accent outline-text">Researcher</span>
        </h1>
        <p className="mx-auto mt-5 max-w-3xl text-base font-bold italic leading-tight text-neo-black md:text-xl">
          Scrape Meta ads, Google Trends, TikTok ad signals, and Reddit discussions, then use the saved AI engine settings to identify the niche, winning angles, KPIs, audience clues, timing patterns, and content structure.
        </p>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl space-y-8 pb-20">
        <NeoCard title="RESEARCH_PARAMETERS" className="bg-white p-5 md:p-8 rotate-1">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <label className="flex flex-col gap-2 lg:col-span-4">
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-neo-black/60">Niche or Keyword</span>
              <input
                type="text"
                value={filters.niche}
                onChange={event => updateFilter('niche', event.target.value)}
                placeholder="e.g. Real Estate, SaaS, Skin Care"
                className="w-full bg-white px-4 py-3 text-sm font-black text-neo-black outline-none neo-border-sm focus:bg-neo-muted"
              />
            </label>

            <label className="flex flex-col gap-2 lg:col-span-4">
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-neo-black/60">Page URL or Page Name</span>
              <input
                type="text"
                value={filters.pageUrl}
                onChange={event => updateFilter('pageUrl', event.target.value)}
                placeholder="Optional. Used for niche detection and page context."
                className="w-full bg-white px-4 py-3 text-sm font-black text-neo-black outline-none neo-border-sm focus:bg-neo-muted"
              />
            </label>

            <label className="flex flex-col gap-2 lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-neo-black/60">Country</span>
              <select
                value={filters.country}
                onChange={event => updateFilter('country', event.target.value)}
                className="w-full cursor-pointer bg-white px-3 py-3 text-xs font-black uppercase text-neo-black outline-none neo-border-sm focus:bg-neo-muted"
              >
                {countryOptions.map(country => <option key={country} value={country}>{country}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-2 lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-neo-black/60">Data Basis</span>
              <input
                type="number"
                min={1}
                max={500}
                value={filters.resultCount}
                onChange={event => updateFilter('resultCount', Math.max(1, Math.min(500, Number(event.target.value) || 1)))}
                className="w-full bg-white px-3 py-3 text-xs font-black text-neo-black outline-none neo-border-sm focus:bg-neo-muted"
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <label className="flex flex-col gap-2 lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-neo-black/60">Meta Platform</span>
              <select
                value={filters.platform}
                onChange={event => updateFilter('platform', event.target.value as Platform)}
                className="w-full cursor-pointer bg-white px-3 py-3 text-xs font-black uppercase text-neo-black outline-none neo-border-sm focus:bg-neo-muted"
              >
                {Object.values(Platform).map(platform => (
                  <option key={platform} value={platform}>{platformLabels[platform]}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-neo-black/60">Meta Status</span>
              <select
                value={filters.status}
                onChange={event => updateFilter('status', event.target.value as AdStatus)}
                className="w-full cursor-pointer bg-white px-3 py-3 text-xs font-black uppercase text-neo-black outline-none neo-border-sm focus:bg-neo-muted"
              >
                {Object.values(AdStatus).map(status => (
                  <option key={status} value={status}>{statusLabels[status]}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-neo-black/60">Trend Window</span>
              <select
                value={filters.timeframe}
                onChange={event => updateFilter('timeframe', event.target.value)}
                className="w-full cursor-pointer bg-white px-3 py-3 text-xs font-black uppercase text-neo-black outline-none neo-border-sm focus:bg-neo-muted"
              >
                {timeframeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-2 lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-neo-black/60">Impression Date</span>
              <input
                type="date"
                value={filters.impressionDate}
                onChange={event => updateFilter('impressionDate', event.target.value)}
                className="w-full cursor-pointer bg-white px-3 py-3 text-xs font-black text-neo-black outline-none neo-border-sm focus:bg-neo-muted"
              />
            </label>

            <label className="flex items-center justify-between gap-3 bg-neo-muted px-4 py-3 neo-border-sm lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Use Saved AI</span>
              <input
                type="checkbox"
                checked={filters.useAI}
                onChange={event => updateFilter('useAI', event.target.checked)}
                className="h-5 w-5 accent-black"
              />
            </label>

            <label className="flex items-center justify-between gap-3 bg-neo-muted px-4 py-3 neo-border-sm lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Headless</span>
              <input
                type="checkbox"
                checked={filters.headless}
                onChange={event => updateFilter('headless', event.target.checked)}
                className="h-5 w-5 accent-black"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(sourceLabels) as DataSource[]).map(source => (
              <SourceToggle
                key={source}
                source={source}
                enabled={filters.sources[source]}
                onToggle={() => toggleSource(source)}
              />
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-12 lg:items-end">
            <label className="flex flex-col gap-2 lg:col-span-8">
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-neo-black/60">Server Endpoint</span>
              <input
                type="text"
                value={apiEndpoint}
                onChange={event => setApiEndpoint(event.target.value)}
                className="w-full bg-neo-muted px-4 py-3 font-mono text-xs font-black text-neo-black outline-none neo-border-sm focus:bg-white"
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-4">
              <button
                type="button"
                onClick={handleStartResearch}
                disabled={loading}
                className="flex-1 bg-neo-accent px-6 py-3 text-xs font-black uppercase tracking-[0.25em] text-white neo-border-sm neo-shadow-sm transition-transform active:translate-x-1 active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Analyzing...' : 'Run Research'}
              </button>
              <button
                type="button"
                onClick={clearResults}
                disabled={loading}
                className="bg-white px-6 py-3 text-xs font-black uppercase tracking-[0.25em] text-neo-black neo-border-sm transition-transform active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset
              </button>
            </div>
          </div>
        </NeoCard>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <NeoCard title="EXECUTION_CONSOLE" className="h-full bg-white p-5 -rotate-1">
              <ScraperTerminal logs={logs} />
            </NeoCard>
          </div>

          <div className="lg:col-span-7">
            <ProgressMonitor
              state={browserState}
              progress={progress}
              filters={filters}
              metaCount={metaAds.length}
              tiktokCount={tiktokAds.length}
              redditCount={redditPosts.length}
              hasTrends={Boolean(googleTrends)}
              loading={loading}
            />
          </div>
        </div>

        {hasAnyResults && (
          <>
            <InsightsPanel response={response} analysis={analysis} analysisText={response?.analysisText || ''} />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <MetricCard label="Meta Ads" value={String(metaAds.length)} />
              <MetricCard label="TikTok Items" value={String(tiktokAds.length)} />
              <MetricCard label="Reddit Posts" value={String(redditPosts.length)} />
              <MetricCard label="Total Impressions" value={formatNumber(totalImpressions || kpis.totalImpressions)} accent />
              <MetricCard label="Avg. Impressions" value={formatNumber(kpis.averageImpressions)} />
              <MetricCard label="Content Diversity" value={formatNumber(kpis.contentDiversityScore)} />
            </div>

            <TrendsPanel trend={googleTrends} />

            {metaAds.length > 0 && (
              <section className="space-y-5">
                <div className="inline-block bg-neo-secondary px-4 py-2 neo-border-sm rotate-1">
                  <h2 className="text-xs font-black uppercase tracking-[0.28em] text-neo-black">META_AD_RESULTS</h2>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {metaAds.map((ad, index) => <AdCard key={`${ad.id}-${index}`} ad={ad} />)}
                </div>
              </section>
            )}

            {tiktokAds.length > 0 && (
              <section className="space-y-5">
                <div className="inline-block bg-neo-black px-4 py-2 text-white neo-border-sm -rotate-1">
                  <h2 className="text-xs font-black uppercase tracking-[0.28em]">TIKTOK_AD_RESULTS</h2>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {tiktokAds.map((item, index) => <TikTokCard key={`${item.id}-${index}`} item={item} />)}
                </div>
              </section>
            )}


            {redditPosts.length > 0 && (
              <section className="space-y-5">
                <div className="inline-block bg-orange-200 px-4 py-2 neo-border-sm rotate-1">
                  <h2 className="text-xs font-black uppercase tracking-[0.28em] text-neo-black">REDDIT_DISCUSSION_RESULTS</h2>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {redditPosts.map((post, index) => <RedditCard key={`${post.id}-${index}`} post={post} />)}
                </div>
              </section>
            )}
          </>
        )}

        {!loading && !hasAnyResults && logs.length > 0 && browserState === 'complete' && (
          <NeoCard title="NO_RESULTS" className="bg-neo-secondary p-8 text-center -rotate-1">
            <p className="text-lg font-black uppercase tracking-tight text-neo-black">
              The server responded, but no usable research records were found. Try a broader niche, another country, or fewer source restrictions.
            </p>
          </NeoCard>
        )}
      </main>

      {error && (
        <div className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 bg-rose-200 p-4 text-neo-black neo-border neo-shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-rose-500 text-xl font-black text-white neo-border-sm">!</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.28em]">Research Error</p>
              <p className="mt-1 text-sm font-bold leading-relaxed">{error}</p>
            </div>
            <button type="button" onClick={() => setError(null)} className="text-xl font-black opacity-60 hover:opacity-100">×</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ADSScraperPage;
