import React, { useEffect, useMemo, useState } from 'react';
import FacebookChatsPage from './FacebookChatsPage';
import EmailChatsComponent from '../components/messaging/EmailChatsComponent';
import TelegramChatsComponent from '../components/messaging/TelegramChatsComponent';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { dbGetFacebookSettings } from '../services/settingsService';
import {
  ConfiguredFacebookPage,
  MultiPageFacebookSettings,
  getFacebookPageAccessToken,
  normalizeFacebookPages,
} from '../utils/facebookPageUtils';

export type MessagingChannel = 'facebook' | 'email' | 'telegram';

const MIN_OPEN_PAGE_WINDOWS = 2;

type PageWorkspace = {
  id: string;
  page: ConfiguredFacebookPage;
  activeChannel: MessagingChannel;
};

export type MessagingPageScope = {
  workspaceId: string;
  facebookPage: ConfiguredFacebookPage;
  facebookPageId: string;
  facebookPageName: string;
  pageAccessToken: string | null;
  businessScopeKey: string;
  productScopeKey: string;
};

export const MessagingPageScopeContext = React.createContext<MessagingPageScope | null>(null);

export const useMessagingPageScope = () => React.useContext(MessagingPageScopeContext);

type FacebookChatsPageWithScopeProps = {
  workspaceId?: string;
  facebookPage?: ConfiguredFacebookPage;
  facebookPageId?: string;
  facebookPageName?: string;
  pageAccessToken?: string | null;
  businessScopeKey?: string;
  productScopeKey?: string;
};

const ScopedFacebookChatsPage = FacebookChatsPage as React.ComponentType<FacebookChatsPageWithScopeProps>;

const channels: { id: MessagingChannel; label: string; icon: string }[] = [
  { id: 'facebook', label: 'FACEBOOK', icon: '📘' },
  { id: 'email', label: 'EMAIL', icon: '✉️' },
  { id: 'telegram', label: 'TELEGRAM', icon: '✈️' },
];

const createWorkspace = (page: ConfiguredFacebookPage): PageWorkspace => ({
  id: `fb-page-${page.id}`,
  page,
  activeChannel: 'facebook',
});

const buildScope = (workspace: PageWorkspace): MessagingPageScope => {
  const pageName = workspace.page.name || workspace.page.id;

  return {
    workspaceId: workspace.id,
    facebookPage: workspace.page,
    facebookPageId: workspace.page.id,
    facebookPageName: pageName,
    pageAccessToken: getFacebookPageAccessToken(workspace.page),
    businessScopeKey: `business:${workspace.page.id}`,
    productScopeKey: `products:${workspace.page.id}`,
  };
};

const MessagingPage: React.FC = () => {
  const [fbSettings, setFbSettings] = useState<MultiPageFacebookSettings | null>(null);
  const [fbPages, setFbPages] = useState<ConfiguredFacebookPage[]>([]);
  const [workspaces, setWorkspaces] = useState<PageWorkspace[]>([]);
  const [focusedWorkspaceId, setFocusedWorkspaceId] = useState<string | null>(null);
  const [pageToOpenId, setPageToOpenId] = useState('');
  const [isLoadingPages, setIsLoadingPages] = useState(true);
  const [pageLoadError, setPageLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadFacebookPages = async () => {
      setIsLoadingPages(true);
      setPageLoadError(null);

      try {
        const settings = (await dbGetFacebookSettings()) as MultiPageFacebookSettings;
        const pages = normalizeFacebookPages(settings);
        const initialPages = pages.slice(0, Math.min(MIN_OPEN_PAGE_WINDOWS, pages.length));
        const initialWorkspaces = initialPages.map(createWorkspace);

        setFbSettings(settings);
        setFbPages(pages);
        setWorkspaces(initialWorkspaces);
        setFocusedWorkspaceId(initialWorkspaces[0]?.id || null);
        setPageToOpenId(
          pages.find(page => !initialWorkspaces.some(workspace => workspace.page.id === page.id))?.id ||
            pages[0]?.id ||
            ''
        );

        if (!settings.appId) {
          setPageLoadError('Facebook App ID is not configured. Please set it in Settings.');
        } else if (pages.length === 0) {
          setPageLoadError('No Facebook pages are configured. Add Facebook pages in Settings first.');
        }
      } catch (err) {
        console.error('Failed to load Facebook pages for Messaging:', err);
        setPageLoadError('Could not load configured Facebook pages.');
      } finally {
        setIsLoadingPages(false);
      }
    };

    loadFacebookPages();
  }, []);

  const availablePagesToOpen = useMemo(
    () => fbPages.filter(page => !workspaces.some(workspace => workspace.page.id === page.id)),
    [fbPages, workspaces]
  );

  const minimumWindowCount = Math.min(MIN_OPEN_PAGE_WINDOWS, fbPages.length);
  const canCloseWorkspace = workspaces.length > minimumWindowCount;

  const handleOpenPageWindow = () => {
    if (!pageToOpenId) return;

    const existingWorkspace = workspaces.find(workspace => workspace.page.id === pageToOpenId);
    if (existingWorkspace) {
      setFocusedWorkspaceId(existingWorkspace.id);
      return;
    }

    const page = fbPages.find(item => item.id === pageToOpenId);
    if (!page) return;

    const newWorkspace = createWorkspace(page);
    setWorkspaces(current => [...current, newWorkspace]);
    setFocusedWorkspaceId(newWorkspace.id);
    setPageToOpenId(
      fbPages.find(item => item.id !== page.id && !workspaces.some(workspace => workspace.page.id === item.id))?.id || ''
    );
  };

  const handleCloseWorkspace = (workspaceId: string) => {
    if (!canCloseWorkspace) return;

    setWorkspaces(current => {
      const nextWorkspaces = current.filter(workspace => workspace.id !== workspaceId);

      if (focusedWorkspaceId === workspaceId) {
        setFocusedWorkspaceId(nextWorkspaces[0]?.id || null);
      }

      return nextWorkspaces;
    });
  };

  const handleChangeWorkspaceChannel = (workspaceId: string, channel: MessagingChannel) => {
    setWorkspaces(current =>
      current.map(workspace =>
        workspace.id === workspaceId ? { ...workspace, activeChannel: channel } : workspace
      )
    );
    setFocusedWorkspaceId(workspaceId);
  };

  const renderWorkspaceContent = (workspace: PageWorkspace) => {
    const scope = buildScope(workspace);

    return (
      <MessagingPageScopeContext.Provider key={workspace.id} value={scope}>
        <div
          key={`${workspace.id}-${workspace.activeChannel}`}
          className="h-full min-h-[560px] overflow-auto bg-white"
          data-workspace-id={workspace.id}
          data-facebook-page-id={workspace.page.id}
          data-business-scope-key={scope.businessScopeKey}
          data-product-scope-key={scope.productScopeKey}
        >
          {workspace.activeChannel === 'facebook' && (
            <ScopedFacebookChatsPage
              workspaceId={workspace.id}
              facebookPage={workspace.page}
              facebookPageId={workspace.page.id}
              facebookPageName={scope.facebookPageName}
              pageAccessToken={scope.pageAccessToken}
              businessScopeKey={scope.businessScopeKey}
              productScopeKey={scope.productScopeKey}
            />
          )}

          {workspace.activeChannel === 'email' && <EmailChatsComponent />}
          {workspace.activeChannel === 'telegram' && <TelegramChatsComponent />}
        </div>
      </MessagingPageScopeContext.Provider>
    );
  };

  if (isLoadingPages) {
    return (
      <div className="w-full h-full min-h-screen flex flex-col items-center justify-center bg-neo-bg">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-xs font-black uppercase tracking-widest text-neo-black/60">
          Loading page workspaces...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-screen flex flex-col bg-neo-bg font-space relative overflow-hidden">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <div className="relative z-10 bg-neo-bg border-b-4 border-neo-black px-6 md:px-8 pt-6">
        <div className="flex flex-col xl:flex-row justify-between gap-5">
          <div>
            <div className="inline-block bg-neo-accent text-white px-2 py-0.5 border-2 border-black text-[10px] font-black uppercase tracking-widest rotate-1 mb-2">
              PAGE-SCOPED MESSAGING
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-neo-black leading-none">
              MULTI PAGE <span className="text-neo-accent">WINDOWS</span>
            </h1>
            <p className="mt-2 text-xs font-bold uppercase tracking-wider text-neo-black/55">
              Each open page has its own business, product, token, and chat scope.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="min-w-[260px]">
              <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-neo-black/60">
                OPEN PAGE WINDOW
              </label>
              <select
                value={pageToOpenId}
                onChange={event => setPageToOpenId(event.target.value)}
                className="w-full p-3 neo-border-sm bg-white text-xs font-black uppercase tracking-widest"
                disabled={fbPages.length === 0}
              >
                {availablePagesToOpen.length === 0 && (
                  <option value="">ALL CONFIGURED PAGES ARE OPEN</option>
                )}
                {availablePagesToOpen.map(page => (
                  <option key={page.id} value={page.id}>
                    {(page.name || page.id).toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleOpenPageWindow}
              disabled={!pageToOpenId || availablePagesToOpen.length === 0}
              className="px-5 py-3 bg-neo-secondary text-neo-black border-2 border-black font-black uppercase text-xs tracking-widest neo-shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
            >
              <i className="fas fa-plus mr-2"></i>
              Add Window
            </button>
          </div>
        </div>

        {pageLoadError && (
          <div className="mt-5 bg-red-100 text-red-800 border-2 border-black p-3 text-xs font-black uppercase tracking-wider">
            <i className="fas fa-triangle-exclamation mr-2"></i>
            {pageLoadError}
          </div>
        )}

        <div className="mt-6 flex gap-2 overflow-x-auto pb-4">
          {workspaces.map(workspace => {
            const isFocused = focusedWorkspaceId === workspace.id;

            return (
              <button
                key={workspace.id}
                onClick={() => setFocusedWorkspaceId(workspace.id)}
                className={`flex items-center gap-3 px-4 py-3 min-w-[220px] border-2 border-black text-left transition-all ${
                  isFocused
                    ? 'bg-neo-black text-white shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] -translate-y-1'
                    : 'bg-white text-neo-black hover:bg-neo-secondary shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                }`}
              >
                <span className="w-8 h-8 border-2 border-black bg-white text-neo-black flex items-center justify-center shrink-0">
                  <i className="fab fa-facebook-f"></i>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-black uppercase tracking-widest opacity-70">
                    {workspace.activeChannel}
                  </span>
                  <span className="block text-xs font-black uppercase truncate">
                    {workspace.page.name || workspace.page.id}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-auto p-6 md:p-8">
        {workspaces.length === 0 ? (
          <div className="h-[520px] flex flex-col items-center justify-center bg-white border-4 border-black neo-shadow-md text-center p-8">
            <div className="w-24 h-24 border-4 border-black bg-neo-muted flex items-center justify-center mb-6 -rotate-3">
              <i className="fas fa-window-restore text-4xl text-neo-black/30"></i>
            </div>
            <p className="text-sm font-black uppercase tracking-widest text-neo-black/60">
              No page windows available
            </p>
            <p className="mt-2 text-xs font-bold uppercase tracking-wider text-neo-black/40">
              Configure at least one Facebook page in Settings.
            </p>
          </div>
        ) : (
          <div>
            {workspaces.map(workspace => {
              const scope = buildScope(workspace);
              const isFocused = focusedWorkspaceId === workspace.id;
              const hasPageToken = Boolean(scope.pageAccessToken || fbSettings?.accessToken);

              return (
                <section
                  key={workspace.id}
                  className={`bg-white border-4 my-4 border-black neo-shadow-md flex flex-col min-h-[720px] transition-all ${
                    isFocused ? 'ring-4 ring-neo-accent' : ''
                  }`}
                  onMouseDown={() => setFocusedWorkspaceId(workspace.id)}
                  aria-label={`Messaging window for ${scope.facebookPageName}`}
                >
                  <div className="bg-neo-black text-white px-4 py-3 flex items-center justify-between gap-3 border-b-4 border-black">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/55">
                        <span className={`w-2 h-2 border border-white ${hasPageToken ? 'bg-green-400' : 'bg-red-400'}`}></span>
                        {hasPageToken ? 'PAGE TOKEN ACTIVE' : 'TOKEN MISSING'}
                      </div>
                      <h2 className="text-sm font-black uppercase tracking-widest truncate">
                        {scope.facebookPageName}
                      </h2>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="hidden sm:inline-block px-2 py-1 bg-white text-neo-black border border-white text-[9px] font-black uppercase tracking-widest">
                        {isFocused ? 'FOCUSED' : 'OPEN'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFocusedWorkspaceId(workspace.id)}
                        className="w-8 h-8 bg-neo-secondary text-neo-black border-2 border-white flex items-center justify-center font-black"
                        title="Focus this page window"
                      >
                        <i className="fas fa-up-right-and-down-left-from-center text-xs"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCloseWorkspace(workspace.id)}
                        disabled={!canCloseWorkspace}
                        className="w-8 h-8 bg-neo-accent text-white border-2 border-white flex items-center justify-center font-black disabled:opacity-30 disabled:cursor-not-allowed"
                        title={
                          canCloseWorkspace
                            ? 'Close page window'
                            : `At least ${minimumWindowCount} page window${minimumWindowCount === 1 ? '' : 's'} must stay open`
                        }
                      >
                        <i className="fas fa-xmark"></i>
                      </button>
                    </div>
                  </div>

                  <div className="bg-neo-bg border-b-4 border-black flex flex-wrap gap-2 p-3">
                    {channels.map(channel => (
                      <button
                        key={`${workspace.id}-${channel.id}`}
                        onClick={() => handleChangeWorkspaceChannel(workspace.id, channel.id)}
                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 border-black transition-all ${
                          workspace.activeChannel === channel.id
                            ? 'bg-neo-accent text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                            : 'bg-white text-neo-black hover:bg-neo-secondary'
                        }`}
                      >
                        <span className="mr-2">{channel.icon}</span>
                        {channel.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white border-b-2 border-black p-3 text-[9px] font-black uppercase tracking-widest text-neo-black/55">
                    <div className="truncate" title={scope.businessScopeKey}>
                      Business Scope: <span className="text-neo-black">{scope.businessScopeKey}</span>
                    </div>
                    <div className="truncate" title={scope.productScopeKey}>
                      Product Scope: <span className="text-neo-black">{scope.productScopeKey}</span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-hidden">
                    {renderWorkspaceContent(workspace)}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagingPage;
