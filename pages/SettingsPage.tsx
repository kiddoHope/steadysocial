import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Input from '../components/ui/Input';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { FacebookSettings, ManagedFacebookPage, FacebookPermissionKey } from '../types';
import Button from '../components/ui/Button';
import {
  dbGetFacebookSettings,
  dbSaveFacebookSettings,
  dbSaveAISettings,
} from '../services/settingsService';
import Alert from '../components/ui/Alert';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import { useAI } from '../contexts/AIContext';
import { AIProvider } from '../types';
import {
  normalizeFacebookPages,
  sanitizeFacebookPages,
  buildFacebookPageFeatures,
  getFacebookPageAccessToken,
  ConfiguredFacebookPage,
  MultiPageFacebookSettings,
  FacebookPageConnectionStatus,
} from '../utils/facebookPageUtils';

type McpClientType = 'claude-desktop' | 'codex' | 'pi-coding-agent' | 'generic';

type BackendRouteStatus = 'unknown' | 'online' | 'offline';

const FACEBOOK_BACKEND_URL = 'http://localhost:3001';
const FACEBOOK_OAUTH_CALLBACK_URL = `${FACEBOOK_BACKEND_URL}/facebook/oauth/callback`;

interface FacebookOAuthMessage {
  source?: string;
  success?: boolean;
  message?: string;
  pageCount?: number;
  pages?: { id: string; name?: string }[];
}

interface McpConfigState {
  mcpServerPath: string;
  apiUrl: string;
  selectedClient: McpClientType;
}

const fetchFacebookPageInfo = async (page: ManagedFacebookPage) => {
  const response = await fetch(
    `${FACEBOOK_BACKEND_URL}/facebook/page-info/${encodeURIComponent(page.id)}?fields=id,name`,
    {
      headers: {
        Accept: 'application/json',
        'x-access-token': page.accessToken,
      },
    }
  );

  const data = await response.json();

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || data?.message || `Facebook Graph API returned HTTP ${response.status}`);
  }

  return data as { id: string; name: string };
};
const MCP_CONFIG_STORAGE_KEY = 'steadysocial_mcp_agent_config';

const DEFAULT_MCP_CONFIG: McpConfigState = {
  mcpServerPath: 'C:/vs code/steadysocial/steadysocial-mcp-server/dist/index.js',
  apiUrl: 'http://localhost:3001',
  selectedClient: 'pi-coding-agent',
};

const getSavedMcpConfig = (): McpConfigState => {
  try {
    const saved = localStorage.getItem(MCP_CONFIG_STORAGE_KEY);
    if (!saved) return DEFAULT_MCP_CONFIG;

    return {
      ...DEFAULT_MCP_CONFIG,
      ...JSON.parse(saved),
    };
  } catch (error) {
    console.error('Failed to load MCP settings:', error);
    return DEFAULT_MCP_CONFIG;
  }
};

const buildClaudeConfig = (config: McpConfigState) => {
  return JSON.stringify(
    {
      mcpServers: {
        steadysocial: {
          command: 'node',
          args: [config.mcpServerPath],
          env: {
            STEADYSOCIAL_API_URL: config.apiUrl,
          },
        },
      },
    },
    null,
    2
  );
};

const buildPiConfig = (config: McpConfigState) => {
  return JSON.stringify(
    {
      settings: {
        toolPrefix: 'mcp',
        idleTimeout: 10,
      },
      mcpServers: {
        steadysocial: {
          command: 'node',
          args: [config.mcpServerPath],
          env: {
            STEADYSOCIAL_API_URL: config.apiUrl,
          },
          lifecycle: 'lazy',
        },
      },
    },
    null,
    2
  );
};

const buildCodexConfig = (config: McpConfigState) => {
  return [
    '[mcp_servers.steadysocial]',
    'command = "node"',
    `args = ["${config.mcpServerPath}"]`,
    `env = { STEADYSOCIAL_API_URL = "${config.apiUrl}" }`,
  ].join('\n');
};

const getMcpConfigText = (config: McpConfigState) => {
  switch (config.selectedClient) {
    case 'claude-desktop':
      return buildClaudeConfig(config);
    case 'codex':
      return buildCodexConfig(config);
    case 'pi-coding-agent':
      return buildPiConfig(config);
    default:
      return buildClaudeConfig(config);
  }
};

const getMcpConfigLocation = (client: McpClientType) => {
  switch (client) {
    case 'claude-desktop':
      return 'Claude Desktop config file. Add or merge this under mcpServers.';
    case 'codex':
      return 'Codex config.toml. Add this block to your Codex MCP servers config.';
    case 'pi-coding-agent':
      return 'C:/Users/YOUR_USERNAME/.pi/agent/mcp.json';
    default:
      return 'Any MCP-compatible client that supports local stdio servers.';
  }
};

export const SettingsPage: React.FC = () => {
  const {
    llmSettings,
    setLlmSettings,
    creativeModelLoaded,
    availableModels,
    generateChatResponse,
  } = useAI();

  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  const [inputFbAppId, setInputFbAppId] = useState('');
  const [inputFbAppSecret, setInputFbAppSecret] = useState('');
  const [inputFbAccessToken, setInputFbAccessToken] = useState('');
  const [inputFbPageId, setInputFbPageId] = useState('');
  const [inputFbPageName, setInputFbPageName] = useState('');
  const [facebookPages, setFacebookPages] = useState<ConfiguredFacebookPage[]>([]);
  const [mainAppLoginStatus, setMainAppLoginStatus] = useState<'unknown' | 'connected' | 'not_authorized'>('unknown');
  const [connectedPageName, setConnectedPageName] = useState<string | null>(null);
  const [aiAgentContext, setAiAgentContext] = useState('');
  const [selectedKnowledgePageId, setSelectedKnowledgePageId] = useState('');
  const [testInquiry, setTestInquiry] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [isTestingContext, setIsTestingContext] = useState(false);

  const [isFbProcessing, setIsFbProcessing] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [fbActionMessage, setFbActionMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [isSavingAIConfig, setIsSavingAIConfig] = useState(false);
  const [testingPageIds, setTestingPageIds] = useState<string[]>([]);
  const [checkingPermissionsPageIds, setCheckingPermissionsPageIds] = useState<string[]>([]);

  const [mcpConfig, setMcpConfig] = useState<McpConfigState>(() => getSavedMcpConfig());
  const [backendRouteStatus, setBackendRouteStatus] = useState<BackendRouteStatus>('unknown');
  const [isTestingMcpBackend, setIsTestingMcpBackend] = useState(false);
  const [mcpTestDetails, setMcpTestDetails] = useState('');
  const [mcpCopied, setMcpCopied] = useState(false);

  const generatedMcpConfig = useMemo(() => getMcpConfigText(mcpConfig), [mcpConfig]);

  const selectedKnowledgePage = useMemo(
    () => facebookPages.find(page => page.id === selectedKnowledgePageId) || facebookPages.find(page => page.isDefault) || facebookPages[0] || null,
    [facebookPages, selectedKnowledgePageId]
  );

  const activeAiAgentContext = selectedKnowledgePage?.aiAgentContext || aiAgentContext;

  const updateActiveAiAgentContext = useCallback(
    (content: string) => {
      if (!selectedKnowledgePage?.id) {
        setAiAgentContext(content);
        return;
      }

      setFacebookPages(prev =>
        prev.map(page =>
          page.id === selectedKnowledgePage.id
            ? { ...page, aiAgentContext: content }
            : page
        )
      );

      if (selectedKnowledgePage.isDefault) {
        setAiAgentContext(content);
      }
    },
    [selectedKnowledgePage?.id, selectedKnowledgePage?.isDefault]
  );

  useEffect(() => {
    const loadSettings = async () => {
      setIsLoadingSettings(true);
      try {
        const settings = (await dbGetFacebookSettings()) as MultiPageFacebookSettings;
        const loadedPages = normalizeFacebookPages(settings);

        setInputFbAppId(settings.appId || '');
        setInputFbAppSecret((settings as any).appSecret || '');
        setInputFbAccessToken('');
        setInputFbPageId('');
        setInputFbPageName('');
        setFacebookPages(loadedPages);
        setSelectedKnowledgePageId((loadedPages.find(page => page.isDefault) || loadedPages[0])?.id || '');
        setAiAgentContext(settings.aiAgentContext || (loadedPages.find(page => page.isDefault) || loadedPages[0])?.aiAgentContext || '');
      } catch (err) {
        console.error('Failed to load settings:', err);
        setFbActionMessage({ type: 'error', text: 'Could not load Facebook settings.' });
      } finally {
        setIsLoadingSettings(false);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    const handleFacebookOAuthMessage = async (event: MessageEvent<FacebookOAuthMessage>) => {
      if (event.origin !== new URL(FACEBOOK_BACKEND_URL).origin) return;
      if (event.data?.source !== 'steadysocial-facebook-oauth') return;

      setIsFbProcessing(false);

      if (!event.data.success) {
        setMainAppLoginStatus('not_authorized');
        setConnectedPageName(null);
        setFbActionMessage({
          type: 'error',
          text: event.data.message || 'Facebook login failed.',
        });
        return;
      }

      try {
        const settings = (await dbGetFacebookSettings()) as MultiPageFacebookSettings;
        const loadedPages = normalizeFacebookPages(settings);

        setInputFbAppId(settings.appId || inputFbAppId);
        setInputFbAppSecret((settings as any).appSecret || inputFbAppSecret);
        setInputFbAccessToken('');
        setInputFbPageId('');
        setInputFbPageName('');
        setFacebookPages(loadedPages);
        setSelectedKnowledgePageId((loadedPages.find(page => page.isDefault) || loadedPages[0])?.id || '');
        setAiAgentContext(settings.aiAgentContext || (loadedPages.find(page => page.isDefault) || loadedPages[0])?.aiAgentContext || aiAgentContext);
        setMainAppLoginStatus('connected');
        setConnectedPageName(loadedPages.map(page => page.name || page.id).join(', '));

        setFbActionMessage({
          type: 'success',
          text: `Facebook OAuth connected ${loadedPages.length || event.data.pageCount || 0} page(s).`,
        });
      } catch (error: any) {
        console.error('Failed to refresh Facebook OAuth settings:', error);
        setFbActionMessage({
          type: 'error',
          text: `Facebook connected, but settings could not be refreshed: ${error?.message || 'Unknown error'}`,
        });
      }
    };

    window.addEventListener('message', handleFacebookOAuthMessage);
    return () => window.removeEventListener('message', handleFacebookOAuthMessage);
  }, [aiAgentContext, inputFbAppId, inputFbAppSecret]);

  const updateMcpConfig = useCallback((updates: Partial<McpConfigState>) => {
    setMcpConfig(prev => ({ ...prev, ...updates }));
    setMcpCopied(false);
  }, []);

  const handleSaveMcpConfig = useCallback(() => {
    localStorage.setItem(MCP_CONFIG_STORAGE_KEY, JSON.stringify(mcpConfig));
    setFbActionMessage({
      type: 'success',
      text: 'MCP agent connection settings saved locally.',
    });
  }, [mcpConfig]);

  const handleCopyMcpConfig = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedMcpConfig);
      setMcpCopied(true);
      setFbActionMessage({
        type: 'success',
        text: 'MCP config copied to clipboard.',
      });
    } catch (error) {
      console.error('Failed to copy MCP config:', error);
      setFbActionMessage({
        type: 'error',
        text: 'Could not copy MCP config. Select and copy it manually.',
      });
    }
  }, [generatedMcpConfig]);

  const handleTestMcpBackend = useCallback(async () => {
    setIsTestingMcpBackend(true);
    setBackendRouteStatus('unknown');
    setMcpTestDetails('');

    try {
      const routeChecks = await Promise.all(
        ['/campaigns', '/canvases', '/automations'].map(async route => {
          const response = await fetch(`${mcpConfig.apiUrl}${route}`, {
            headers: {
              Accept: 'application/json',
            },
          });

          return {
            route,
            ok: response.ok,
            status: response.status,
          };
        })
      );

      const failedRoutes = routeChecks.filter(item => !item.ok);

      if (failedRoutes.length > 0) {
        setBackendRouteStatus('offline');
        setMcpTestDetails(
          failedRoutes
            .map(item => `${item.route}: HTTP ${item.status}`)
            .join('\n')
        );
        setFbActionMessage({
          type: 'error',
          text: 'Some MCP backend routes are not available.',
        });
        return;
      }

      setBackendRouteStatus('online');
      setMcpTestDetails(
        routeChecks.map(item => `${item.route}: OK`).join('\n')
      );
      setFbActionMessage({
        type: 'success',
        text: 'SteadySocial backend is ready for MCP clients.',
      });
    } catch (error: any) {
      console.error('MCP backend test failed:', error);
      setBackendRouteStatus('offline');
      setMcpTestDetails(error?.message || 'Connection test failed.');
      setFbActionMessage({
        type: 'error',
        text: 'Could not reach the SteadySocial backend for MCP.',
      });
    } finally {
      setIsTestingMcpBackend(false);
    }
  }, [mcpConfig.apiUrl]);

  const handleStartFacebookOAuth = useCallback(async () => {
    const appId = inputFbAppId.trim();
    const appSecret = inputFbAppSecret.trim();

    if (!appId) {
      setFbActionMessage({ type: 'error', text: 'Facebook App ID must be provided.' });
      return;
    }

    if (!appSecret) {
      setFbActionMessage({ type: 'error', text: 'Facebook App Secret must be provided.' });
      return;
    }

    setIsFbProcessing(true);
    setFbActionMessage({
      type: 'info',
      text: 'Opening Facebook Login. Approve the requested Page permissions, then select the Page inside Facebook.',
    });

    try {
      const response = await fetch(`${FACEBOOK_BACKEND_URL}/facebook/oauth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId,
          appSecret,
          redirectUri: FACEBOOK_OAUTH_CALLBACK_URL,
          clientId: 'settings-page',
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success || !result.loginUrl) {
        throw new Error(result.message || 'Could not start Facebook OAuth.');
      }

      const popup = window.open(
        result.loginUrl,
        'steadysocial_facebook_oauth',
        'width=720,height=760,menubar=no,toolbar=no,location=yes,status=no'
      );

      if (!popup) {
        setIsFbProcessing(false);
        setFbActionMessage({
          type: 'error',
          text: 'The Facebook login popup was blocked. Allow popups for this site and try again.',
        });
        return;
      }

      const popupWatcher = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(popupWatcher);
          setIsFbProcessing(false);
        }
      }, 750);
    } catch (error: any) {
      console.error('Facebook OAuth start failed:', error);
      setIsFbProcessing(false);
      setMainAppLoginStatus('not_authorized');
      setFbActionMessage({
        type: 'error',
        text: `Facebook OAuth failed: ${error?.message || 'Unknown error'}`,
      });
    }
  }, [inputFbAppId, inputFbAppSecret]);

  const handleAddFacebookPage = useCallback(() => {
    const pageId = inputFbPageId.trim();
    const accessToken = inputFbAccessToken.trim();
    const pageName = inputFbPageName.trim();

    if (!pageId) {
      setFbActionMessage({ type: 'error', text: 'Page ID must be provided.' });
      return;
    }

    if (!accessToken) {
      setFbActionMessage({ type: 'error', text: 'Page access token must be provided.' });
      return;
    }

    setFacebookPages(prev => {
      const existingPageIndex = prev.findIndex(page => page.id === pageId);

      const nextPage: ConfiguredFacebookPage = {
        id: pageId,
        name: pageName || '',
        accessToken,
        access_token: accessToken,
        isDefault: prev.length === 0,
        status: 'unknown',
        aiAgentContext: '',
      };

      const nextPages: ConfiguredFacebookPage[] = [...prev];

      if (existingPageIndex >= 0) {
        nextPages[existingPageIndex] = {
          ...nextPages[existingPageIndex],
          ...nextPage,
          isDefault: nextPages[existingPageIndex].isDefault,
        };
      } else {
        nextPages.push(nextPage);
      }

      return sanitizeFacebookPages(nextPages);
    });

    setInputFbPageId('');
    setInputFbAccessToken('');
    setInputFbPageName('');
    setFbActionMessage({ type: 'success', text: 'Facebook page added to configuration.' });
  }, [inputFbAccessToken, inputFbPageId, inputFbPageName]);

  const handleUpdateFacebookPage = useCallback(
    (index: number, updates: Partial<ConfiguredFacebookPage>) => {
      setFacebookPages(prev => {
        const updatedPages = prev.map((page, pageIndex) =>
          pageIndex === index
            ? {
                ...page,
                ...updates,
                status:
                  updates.id || updates.accessToken
                    ? 'unknown'
                    : updates.status || page.status || 'unknown',
              }
            : page
        );

        if (updatedPages.length > 0 && !updatedPages.some(page => page.isDefault)) {
          updatedPages[0] = { ...updatedPages[0], isDefault: true };
        }

        return updatedPages;
      });
      setMainAppLoginStatus('unknown');
      setConnectedPageName(null);
    },
    []
  );

  const handleSetDefaultFacebookPage = useCallback((index: number) => {
    setFacebookPages(prev => {
      const nextPages = prev.map((page, pageIndex) => ({
        ...page,
        isDefault: pageIndex === index,
      }));
      const defaultPage = nextPages[index];
      if (defaultPage) {
        setSelectedKnowledgePageId(current => current || defaultPage.id);
        setAiAgentContext(defaultPage.aiAgentContext || aiAgentContext);
      }
      return nextPages;
    });
  }, [aiAgentContext]);

  const handleRemoveFacebookPage = useCallback((index: number) => {
    setFacebookPages(prev => {
      const nextPages = sanitizeFacebookPages(prev.filter((_, pageIndex) => pageIndex !== index));
      setSelectedKnowledgePageId(current =>
        nextPages.some(page => page.id === current)
          ? current
          : (nextPages.find(page => page.isDefault) || nextPages[0])?.id || ''
      );
      return nextPages;
    });
    setMainAppLoginStatus('unknown');
    setConnectedPageName(null);
  }, []);

  const buildFacebookSettingsPayload = useCallback(
    (pagesToSave: ConfiguredFacebookPage[]): Partial<MultiPageFacebookSettings> => {
      const cleanedPages = sanitizeFacebookPages(pagesToSave);
      const defaultPage = cleanedPages.find(page => page.isDefault) || cleanedPages[0];
      const pageContexts = cleanedPages.reduce<Record<string, string>>((acc, page) => {
        if (page.aiAgentContext?.trim()) {
          acc[page.id] = page.aiAgentContext;
        }
        return acc;
      }, {});
      const defaultPageToken = defaultPage ? getFacebookPageAccessToken(defaultPage) : '';

      return {
        appId: inputFbAppId.trim(),
        appSecret: inputFbAppSecret.trim(),
        accessToken: defaultPageToken || '',
        pageId: defaultPage?.id || '',
        pageName: defaultPage?.name || '',
        defaultPageId: defaultPage?.id || '',
        pages: cleanedPages,
        pageContexts,
        aiAgentContext: defaultPage?.aiAgentContext || aiAgentContext,
      };
    },
    [aiAgentContext, inputFbAppId, inputFbAppSecret]
  );

  const handleCheckPagePermissions = useCallback(async (index: number) => {
    const page = facebookPages[index];
    if (!page) return;

    setCheckingPermissionsPageIds(prev => [...new Set([...prev, page.id])]);

    try {
      const response = await fetch(`${FACEBOOK_BACKEND_URL}/facebook/debug-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputToken: page.accessToken,
          appId: inputFbAppId.trim(),
          appSecret: inputFbAppSecret.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setFbActionMessage({
          type: 'error',
          text: result.message || 'Failed to inspect token permissions.',
        });
        return;
      }

      const scopes: FacebookPermissionKey[] = (result.data?.scopes || []) as FacebookPermissionKey[];
      const features = buildFacebookPageFeatures(scopes);
      const updatedPages = sanitizeFacebookPages(
        facebookPages.map((item, pageIndex) =>
          pageIndex === index
            ? {
                ...item,
                permissions: scopes,
                features,
                status: features.canManageMessenger ? 'connected' : item.status || 'unknown',
              }
            : item
        )
      );

      setFacebookPages(updatedPages);

      if (inputFbAppId.trim()) {
        await dbSaveFacebookSettings(
          buildFacebookSettingsPayload(updatedPages) as Partial<FacebookSettings>
        );
      }

      setFbActionMessage({
        type: 'success',
        text: result.data?.warning
          ? `Permissions loaded and saved (${result.data.warning})`
          : `Loaded and saved ${scopes.length} permission(s) for ${page.name || page.id}.`,
      });
    } catch (error: any) {
      console.error('Permission check failed:', error);
      setFbActionMessage({
        type: 'error',
        text: `Permission check failed: ${error?.message || 'Unknown error'}`,
      });
    } finally {
      setCheckingPermissionsPageIds(prev => prev.filter(pid => pid !== page.id));
    }
  }, [buildFacebookSettingsPayload, facebookPages, inputFbAppId, inputFbAppSecret]);

  const handleTestFacebookPage = useCallback(async (index: number) => {
    const page = facebookPages[index];

    if (!page) return;

    setTestingPageIds(prev => [...new Set([...prev, page.id])]);

    try {
      const pageInfo = await fetchFacebookPageInfo(page);

      setFacebookPages(prev =>
        sanitizeFacebookPages(
          prev.map((item, pageIndex) =>
            pageIndex === index
              ? {
                  ...item,
                  id: pageInfo.id || item.id,
                  name: pageInfo.name || item.name,
                  status: 'connected',
                  lastTestedAt: new Date().toISOString(),
                }
              : item
          )
        )
      );

      setFbActionMessage({
        type: 'success',
        text: `Connected to page: ${pageInfo.name || page.id}`,
      });
    } catch (error: any) {
      console.error('Facebook page connection test failed:', error);

      setFacebookPages(prev =>
        sanitizeFacebookPages(
          prev.map((item, pageIndex) =>
            pageIndex === index
              ? {
                  ...item,
                  status: 'not_authorized',
                  lastTestedAt: new Date().toISOString(),
                }
              : item
          )
        )
      );

      setFbActionMessage({
        type: 'error',
        text: `Connection failed for ${page.name || page.id}: ${error?.message || 'Unknown error'}`,
      });
    } finally {
      setTestingPageIds(prev => prev.filter(pageId => pageId !== page.id));
    }
  }, [facebookPages]);

  const handleSaveFacebookConfig = useCallback(async () => {
    if (!inputFbAppId.trim()) {
      setFbActionMessage({ type: 'error', text: 'Facebook App ID must be provided.' });
      return;
    }

    const cleanedPages = sanitizeFacebookPages(facebookPages);

    setIsSavingConfig(true);
    setFbActionMessage(null);

    try {
      const savedSettings = (await dbSaveFacebookSettings(
        buildFacebookSettingsPayload(cleanedPages) as Partial<FacebookSettings>
      )) as MultiPageFacebookSettings;

      const savedPages = normalizeFacebookPages(savedSettings);

      setFacebookPages(savedPages.length > 0 ? savedPages : cleanedPages);

      setFbActionMessage({ type: 'success', text: 'Settings saved successfully.' });
    } catch (e) {
      console.error('Failed to save settings:', e);
      setFbActionMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setIsSavingConfig(false);
    }
  }, [
    inputFbAppId,
    facebookPages,
    buildFacebookSettingsPayload,
  ]);

  const handleSaveAIConfig = useCallback(async () => {
    setIsSavingAIConfig(true);
    setFbActionMessage(null);

    try {
      await dbSaveAISettings(llmSettings);
      setFbActionMessage({ type: 'success', text: 'AI configuration saved to backend.' });
    } catch (e) {
      console.error('Failed to save AI settings:', e);
      setFbActionMessage({ type: 'error', text: 'Failed to save AI settings to backend.' });
    } finally {
      setIsSavingAIConfig(false);
    }
  }, [llmSettings]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      updateActiveAiAgentContext(content);
    };
    reader.readAsText(file);
  };

  const handleTestContext = async () => {
    if (!testInquiry.trim() || !activeAiAgentContext) return;

    setIsTestingContext(true);
    setTestResponse('');

    try {
      const prompt = `
CONTEXT_KNOWLEDGE_BASE:
${activeAiAgentContext}

CUSTOMER_INQUIRY:
${testInquiry}

INSTRUCTIONS:
Answer the customer's inquiry based ONLY on the provided context.
Keep it professional, friendly, and concise.
Respond only with the message text.
      `;

      const response = await generateChatResponse({
        userMessage: prompt,
        history: [],
        onChunk: chunk => setTestResponse(prev => prev + chunk),
      });

      if (response) setTestResponse(response);
    } catch (err) {
      setTestResponse('Error testing context: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsTestingContext(false);
    }
  };

  const handleConnect = useCallback(async () => {
    await handleStartFacebookOAuth();
  }, [handleStartFacebookOAuth]);

  const handleDisconnect = async () => {
    setIsFbProcessing(true);
    setFbActionMessage(null);

    try {
      await fetch(`${FACEBOOK_BACKEND_URL}/facebook/oauth/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.warn('Backend disconnect failed, clearing local Facebook state only:', error);
    } finally {
      setFacebookPages([]);
      setSelectedKnowledgePageId('');
      setInputFbAccessToken('');
      setInputFbPageId('');
      setInputFbPageName('');
      setMainAppLoginStatus('unknown');
      setConnectedPageName(null);
      setIsFbProcessing(false);
      setFbActionMessage({ type: 'success', text: 'Facebook connection removed from this app.' });
    }
  };

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center h-screen bg-neo-bg">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-12 max-w-[1400px] mx-auto">
        <div className="inline-block bg-neo-accent text-white px-2 py-0.5 mb-2 neo-border-sm rotate-1">
          <span className="text-[10px] font-black uppercase tracking-widest">SYSTEM CONFIGURATION</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-neo-black leading-none mb-4">
          Engine <span className="text-neo-secondary outline-text">Settings</span>
        </h1>
      </header>

      <main className="relative z-10 max-w-[1400px] mx-auto space-y-12">
        {fbActionMessage && (
          <Alert
            type={fbActionMessage.type}
            message={fbActionMessage.text}
            onClose={() => setFbActionMessage(null)}
            className="-rotate-1"
          />
        )}

        <div className="grid lg:grid-cols-2 gap-10">
          <section className="space-y-10">
            <Card title="FACEBOOK_IDENTITY_CONFIG" className="!p-8 neo-shadow-lg bg-white">
              <div className="space-y-6">
                <Input
                  id="fbAppIdInput"
                  label="APP_ID"
                  value={inputFbAppId}
                  onChange={e => setInputFbAppId(e.target.value)}
                  disabled={isSavingConfig || isFbProcessing}
                />

                <Input
                  id="fbAppSecretInput"
                  label="APP_SECRET"
                  value={inputFbAppSecret}
                  onChange={e => setInputFbAppSecret(e.target.value)}
                  disabled={isSavingConfig || isFbProcessing}
                  type="password"
                  placeholder="Your Facebook App Secret"
                />

                <div className="p-4 neo-border-sm bg-neo-muted space-y-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest">FACEBOOK_OAUTH_LOGIN</p>
                    <p className="text-[10px] font-bold text-neo-black/60 uppercase tracking-wider leading-relaxed mt-2">
                      Connect a client Page through Facebook Login. The backend will exchange the login code for a long-lived User token, fetch the Page tokens, save the connected Pages, and subscribe the Page to Messenger webhooks.
                    </p>
                  </div>

                  <div className="p-3 neo-border-sm bg-white">
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">VALID_OAUTH_REDIRECT_URI</p>
                    <p className="text-[10px] font-bold break-all">{FACEBOOK_OAUTH_CALLBACK_URL}</p>
                    <p className="text-[9px] font-bold text-neo-black/50 uppercase tracking-wider mt-2">
                      Add this exact URL in Meta App Dashboard → Facebook Login → Valid OAuth Redirect URIs.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <Button
                      onClick={handleStartFacebookOAuth}
                      disabled={isSavingConfig || isFbProcessing || !inputFbAppId.trim() || !inputFbAppSecret.trim()}
                      variant="primary"
                      className="w-full"
                      isLoading={isFbProcessing}
                    >
                      CONNECT_WITH_FACEBOOK
                    </Button>
                    <Button
                      onClick={handleSaveFacebookConfig}
                      disabled={isSavingConfig || isFbProcessing || !inputFbAppId.trim()}
                      variant="secondary"
                      className="w-full"
                      isLoading={isSavingConfig}
                    >
                      SAVE_APP_CREDENTIALS
                    </Button>
                  </div>

                  <p className="text-[9px] font-bold text-neo-black/50 uppercase tracking-wider">
                    Do not paste Page tokens here. Tokens are now generated by the backend OAuth flow.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50">CONFIGURED_PAGES:</p>
                    <span className="text-[10px] font-black uppercase tracking-widest">{facebookPages.length}</span>
                  </div>

                  {facebookPages.length > 0 ? (
                    <div className="space-y-4">
                      {facebookPages.map((page, index) => (
                        <div key={`${page.id}-${index}`} className="p-4 neo-border-sm bg-neo-bg space-y-4">
                          <div className="flex flex-wrap gap-2 items-center justify-between">
                            <div>
                              <p className="text-xs font-black uppercase tracking-tight">
                                {page.name || `Facebook Page ${index + 1}`}
                              </p>
                              <p className="text-[10px] font-bold text-neo-black/50 break-all">{page.id}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {page.isDefault && (
                                <span className="bg-neo-secondary text-[8px] font-black px-2 py-0.5 neo-border-sm uppercase">
                                  DEFAULT
                                </span>
                              )}
                              <span
                                className={`text-[8px] font-black px-2 py-0.5 neo-border-sm uppercase ${
                                  page.status === 'connected'
                                    ? 'bg-neo-secondary'
                                    : page.status === 'not_authorized'
                                      ? 'bg-neo-accent text-white'
                                      : 'bg-white'
                                }`}
                              >
                                {page.status === 'connected'
                                  ? 'CONNECTED'
                                  : page.status === 'not_authorized'
                                    ? 'FAILED'
                                    : 'NOT_TESTED'}
                              </span>
                            </div>
                          </div>

                          <div className="grid md:grid-cols-2 gap-3">
                            <Input
                              id={`fbPageName-${index}`}
                              label="PAGE_NAME"
                              value={page.name || ''}
                              onChange={e => handleUpdateFacebookPage(index, { name: e.target.value })}
                              disabled={isSavingConfig || isFbProcessing}
                              placeholder="Optional display name"
                            />
                            <Input
                              id={`fbPageId-${index}`}
                              label="PAGE_ID"
                              value={page.id}
                              disabled
                            />
                          </div>

                          <div className="p-3 neo-border-sm bg-white">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[9px] font-black uppercase tracking-widest opacity-60">PAGE_TOKEN</span>
                              <span className="text-[9px] font-black uppercase tracking-widest">
                                {page.accessToken ? 'STORED_FROM_OAUTH' : 'MISSING'}
                              </span>
                            </div>
                            <p className="text-[9px] font-bold text-neo-black/50 uppercase tracking-wider mt-2">
                              Page token is generated by Facebook Login and should not be edited manually.
                            </p>
                          </div>

                          {/* Feature Flags from Permissions */}
                          {page.features && (
                            <div className="p-3 neo-border-sm bg-neo-muted">
                              <p className="text-[9px] font-black uppercase tracking-widest mb-2 opacity-60">FEATURE_ACCESS</p>
                              <div className="flex flex-wrap gap-1.5">
                                {([
                                  { key: 'canReadPage', label: 'READ_PAGE' },
                                  { key: 'canPublishPosts', label: 'PUBLISH_POSTS' },
                                  { key: 'canManageMessenger', label: 'MESSENGER' },
                                  { key: 'canReadAnalytics', label: 'ANALYTICS' },
                                  { key: 'canReadLeads', label: 'LEADS' },
                                  { key: 'canManageInstagram', label: 'INSTAGRAM' },
                                  { key: 'canManageCatalog', label: 'CATALOG' },
                                  { key: 'canReadAds', label: 'ADS_READ' },
                                  { key: 'canManageAds', label: 'ADS_MANAGE' },
                                ] as { key: keyof NonNullable<typeof page.features>; label: string }[]).map(({ key, label }) => (
                                  <span
                                    key={key}
                                    className={`text-[8px] font-black px-1.5 py-0.5 neo-border-sm uppercase ${
                                      page.features![key]
                                        ? 'bg-neo-secondary text-neo-black'
                                        : 'bg-white text-neo-black/40 line-through'
                                    }`}
                                  >
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="grid md:grid-cols-4 gap-2">
                            <Button
                              onClick={() => handleCheckPagePermissions(index)}
                              variant="secondary"
                              size="sm"
                              isLoading={checkingPermissionsPageIds.includes(page.id)}
                              disabled={isSavingConfig || isFbProcessing || !page.id.trim() || !page.accessToken.trim()}
                            >
                              PERMISSIONS
                            </Button>
                            <Button
                              onClick={() => handleTestFacebookPage(index)}
                              variant="secondary"
                              size="sm"
                              isLoading={testingPageIds.includes(page.id)}
                              disabled={isSavingConfig || isFbProcessing || !page.id.trim() || !page.accessToken.trim()}
                            >
                              TEST
                            </Button>
                            <Button
                              onClick={() => handleSetDefaultFacebookPage(index)}
                              variant="primary"
                              size="sm"
                              disabled={Boolean(page.isDefault)}
                            >
                              SET_DEFAULT
                            </Button>
                            <Button
                              onClick={() => handleRemoveFacebookPage(index)}
                              variant="danger"
                              size="sm"
                              disabled={isSavingConfig || isFbProcessing}
                            >
                              REMOVE
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 neo-border-sm bg-neo-bg">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neo-black/60">
                        No Facebook pages connected yet. Use Facebook OAuth Login above to connect Pages automatically.
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleSaveFacebookConfig}
                  disabled={isSavingConfig || isFbProcessing || !inputFbAppId.trim()}
                  variant="primary"
                  className="w-full !py-4"
                  isLoading={isSavingConfig}
                >
                  SAVE_FACEBOOK_CONFIGURATION
                </Button>
              </div>
            </Card>

            <Card title="AI_ENGINE_CONFIG" className="!p-8 neo-shadow-lg bg-white">
              <div className="space-y-8">
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-2">AI_PROVIDER</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[AIProvider.LOCAL, AIProvider.GEMINI, AIProvider.OPENAI].map(provider => (
                      <button
                        key={provider}
                        onClick={() => setLlmSettings({ ...llmSettings, provider })}
                        className={`py-2 px-3 neo-border-sm text-[10px] font-black uppercase tracking-widest transition-all ${
                          llmSettings.provider === provider
                            ? 'bg-neo-black text-white'
                            : 'bg-neo-bg text-neo-black hover:bg-neo-muted'
                        }`}
                      >
                        {provider}
                      </button>
                    ))}
                  </div>
                </div>

                {llmSettings.provider === AIProvider.LOCAL ? (
                  <div className="space-y-6">
                    <Input
                      id="llmEndpointInput"
                      label="API_ENDPOINT"
                      value={llmSettings.local.endpoint}
                      onChange={e =>
                        setLlmSettings({
                          ...llmSettings,
                          local: { ...llmSettings.local, endpoint: e.target.value },
                        })
                      }
                    />
                    {availableModels && availableModels.length > 0 ? (
                      <Select
                        id="llmModelSelect"
                        label="MODEL_IDENTIFIER"
                        value={llmSettings.local.model}
                        onChange={e =>
                          setLlmSettings({
                            ...llmSettings,
                            local: { ...llmSettings.local, model: e.target.value },
                          })
                        }
                        options={availableModels.map(model => ({ value: model, label: model }))}
                      />
                    ) : (
                      <Input
                        id="llmModelInput"
                        label="MODEL_IDENTIFIER"
                        value={llmSettings.local.model}
                        onChange={e =>
                          setLlmSettings({
                            ...llmSettings,
                            local: { ...llmSettings.local, model: e.target.value },
                          })
                        }
                      />
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <Input
                      id="cloudApiKeyInput"
                      label={`${llmSettings.provider.toUpperCase()}_API_KEY`}
                      value={llmSettings.cloud.apiKey}
                      onChange={e =>
                        setLlmSettings({
                          ...llmSettings,
                          cloud: { ...llmSettings.cloud, apiKey: e.target.value },
                        })
                      }
                      type="password"
                      placeholder={`Enter your ${llmSettings.provider} API key`}
                    />
                    <Input
                      id="cloudModelInput"
                      label="MODEL_IDENTIFIER"
                      value={llmSettings.cloud.model}
                      onChange={e =>
                        setLlmSettings({
                          ...llmSettings,
                          cloud: { ...llmSettings.cloud, model: e.target.value },
                        })
                      }
                      placeholder={llmSettings.provider === AIProvider.GEMINI ? 'gemini-2.0-flash' : 'gpt-4o'}
                    />
                  </div>
                )}

                <div className={`p-4 neo-border-sm flex items-center justify-between ${creativeModelLoaded ? 'bg-neo-secondary' : 'bg-neo-accent text-white'}`}>
                  <span className="text-[10px] font-black uppercase tracking-widest">ENGINE_STATUS:</span>
                  <span className="font-black uppercase tracking-widest">{creativeModelLoaded ? 'ACTIVE' : 'OFFLINE'}</span>
                </div>

                <Button
                  onClick={handleSaveAIConfig}
                  variant="primary"
                  className="w-full !py-4"
                  isLoading={isSavingAIConfig}
                >
                  COMMIT_AI_CONFIGURATION
                </Button>
              </div>
            </Card>

            <Card title="EXTERNAL_AGENT_MCP_BRIDGE" className="!p-8 neo-shadow-lg bg-white border-neo-secondary">
              <div className="space-y-6">
                <div className="p-4 neo-border-sm bg-neo-muted">
                  <h3 className="text-sm font-black uppercase tracking-widest mb-2">CONNECT CLAUDE / CODEX / PI / CURSOR</h3>
                  <p className="text-[10px] font-bold text-neo-black/60 uppercase tracking-wider leading-relaxed">
                    This does not connect your internal chatbot. It prepares a local MCP config so external coding agents can manage SteadySocial through your local backend.
                  </p>
                </div>

                <Select
                  id="mcpClientSelect"
                  label="AGENT_CLIENT"
                  value={mcpConfig.selectedClient}
                  onChange={e => updateMcpConfig({ selectedClient: e.target.value as McpClientType })}
                  options={[
                    { value: 'pi-coding-agent', label: 'Pi Coding Agent' },
                    { value: 'claude-desktop', label: 'Claude Desktop / Claude Code' },
                    { value: 'codex', label: 'Codex' },
                    { value: 'generic', label: 'Generic MCP Client' },
                  ]}
                />

                <Input
                  id="mcpServerPathInput"
                  label="MCP_SERVER_DIST_PATH"
                  value={mcpConfig.mcpServerPath}
                  onChange={e => updateMcpConfig({ mcpServerPath: e.target.value })}
                  placeholder="C:/vs code/steadysocial/steadysocial-mcp-server/dist/index.js"
                />

                <Input
                  id="mcpApiUrlInput"
                  label="STEADYSOCIAL_API_URL"
                  value={mcpConfig.apiUrl}
                  onChange={e => updateMcpConfig({ apiUrl: e.target.value })}
                  placeholder="http://localhost:3001"
                />

                <div className={`p-4 neo-border-sm flex items-center justify-between ${backendRouteStatus === 'online' ? 'bg-neo-secondary' : backendRouteStatus === 'offline' ? 'bg-neo-accent text-white' : 'bg-neo-bg'}`}>
                  <span className="text-[10px] font-black uppercase tracking-widest">BACKEND_STATUS:</span>
                  <span className="font-black uppercase tracking-widest">
                    {backendRouteStatus === 'online' ? 'READY_FOR_MCP' : backendRouteStatus === 'offline' ? 'ROUTES_OFFLINE' : 'NOT_TESTED'}
                  </span>
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <Button
                    onClick={handleTestMcpBackend}
                    variant="secondary"
                    className="w-full"
                    isLoading={isTestingMcpBackend}
                  >
                    TEST_BACKEND
                  </Button>
                  <Button
                    onClick={handleSaveMcpConfig}
                    variant="primary"
                    className="w-full"
                  >
                    SAVE_MCP_CONFIG
                  </Button>
                  <Button
                    onClick={handleCopyMcpConfig}
                    variant="primary"
                    className="w-full"
                  >
                    {mcpCopied ? 'COPIED' : 'COPY_CONFIG'}
                  </Button>
                </div>

                {mcpTestDetails && (
                  <div className="p-4 neo-border-sm bg-neo-bg">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-50">ROUTE_TEST_LOG:</p>
                    <pre className="text-[10px] font-bold whitespace-pre-wrap">{mcpTestDetails}</pre>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50">CONFIG_TARGET:</p>
                    <p className="text-[10px] font-bold uppercase text-right">{getMcpConfigLocation(mcpConfig.selectedClient)}</p>
                  </div>

                  <textarea
                    readOnly
                    value={generatedMcpConfig}
                    className="w-full min-h-[260px] neo-border-sm bg-neo-black text-white p-4 text-[10px] font-mono leading-relaxed"
                  />
                </div>

                <div className="p-4 neo-border-sm bg-neo-muted space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest">QUICK_SETUP</p>
                  <ol className="text-[10px] font-bold text-neo-black/70 uppercase tracking-wider space-y-1 list-decimal list-inside">
                    <li>Keep SteadySocial Electron running.</li>
                    <li>Run npm run build inside steadysocial-mcp-server.</li>
                    <li>Copy this config into your selected external agent.</li>
                    <li>Restart the external agent.</li>
                    <li>Ask it to use SteadySocial MCP tools.</li>
                  </ol>
                </div>
              </div>
            </Card>
          </section>

          <section className="space-y-10">
            <Card title="GRAPH_API_CONTROL" className="!p-8 neo-shadow-lg bg-neo-muted">
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest mb-4">GRAPH_API BACKEND</h3>
                  <p className="text-[10px] font-bold text-neo-black/60 mb-4 uppercase tracking-wider">
                    Requests are sent through the local backend using the OAuth-generated Page token.
                  </p>

                  {connectedPageName && mainAppLoginStatus === 'connected' && (
                    <div className="p-3 neo-border-sm bg-neo-secondary mb-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest">LINKED_PAGES:</span>
                        <span className="font-black uppercase text-sm text-right">{connectedPageName}</span>
                      </div>
                    </div>
                  )}

                  {facebookPages.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {facebookPages.map((page, index) => (
                        <div key={`graph-page-${page.id}-${index}`} className="p-3 bg-white neo-border-sm flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase tracking-tight truncate">{page.name || `Facebook Page ${index + 1}`}</p>
                            <p className="text-[10px] font-bold text-neo-black/50 break-all">{page.id}</p>
                          </div>
                          <span
                            className={`text-[8px] font-black px-2 py-0.5 neo-border-sm uppercase whitespace-nowrap ${
                              page.status === 'connected'
                                ? 'bg-neo-secondary'
                                : page.status === 'not_authorized'
                                  ? 'bg-neo-accent text-white'
                                  : 'bg-neo-bg'
                            }`}
                          >
                            {page.status === 'connected'
                              ? 'CONNECTED'
                              : page.status === 'not_authorized'
                                ? 'FAILED'
                                : 'NOT_TESTED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {mainAppLoginStatus !== 'connected' ? (
                    <Button
                      onClick={handleConnect}
                      variant="primary"
                      className="w-full py-4"
                      disabled={
                        isFbProcessing ||
                        (!inputFbAppId.trim() || !inputFbAppSecret.trim())
                      }
                      isLoading={isFbProcessing}
                    >
                      CONNECT_WITH_FACEBOOK_LOGIN
                    </Button>
                  ) : (
                    <Button onClick={handleDisconnect} variant="danger" className="w-full py-4">
                      DISCONNECT
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <Card title="AI_AGENT_KNOWLEDGE_BASE" className="!p-8 neo-shadow-lg bg-white">
              <div className="space-y-6">
                {facebookPages.length > 0 && (
                  <Select
                    id="knowledgePageSelect"
                    label="KNOWLEDGE_BASE_PAGE"
                    value={selectedKnowledgePage?.id || ''}
                    onChange={e => {
                      const pageId = e.target.value;
                      setSelectedKnowledgePageId(pageId);
                      setTestResponse('');
                    }}
                    options={facebookPages.map(page => ({
                      value: page.id,
                      label: `${page.isDefault ? 'DEFAULT - ' : ''}${page.name || page.id}`,
                    }))}
                  />
                )}

                <div className="p-4 neo-border-sm bg-neo-muted">
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-2">UPLOAD_CONTEXT_FOR_SELECTED_PAGE (.MD)</label>
                  <input
                    type="file"
                    accept=".md"
                    onChange={handleFileUpload}
                    className="block w-full text-xs text-neo-black file:mr-4 file:py-2 file:px-4 file:neo-border-sm file:bg-neo-black file:text-white file:font-black file:uppercase file:text-[10px] hover:file:bg-neo-accent cursor-pointer"
                  />
                </div>

                <div className="space-y-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest opacity-60">
                    PAGE_CONTEXT_EDITOR
                  </label>
                  <textarea
                    value={activeAiAgentContext}
                    onChange={e => updateActiveAiAgentContext(e.target.value)}
                    placeholder="Paste the FAQ, policy, tone, product notes, or brand instructions for this selected page."
                    className="w-full min-h-[220px] neo-border-sm bg-neo-bg p-4 text-[10px] font-bold whitespace-pre-wrap focus:bg-white focus:outline-none"
                  />
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neo-black/50">
                    This context follows the selected Facebook page. Messenger will use this page context when no page-specific local database is loaded.
                  </p>
                </div>

                {activeAiAgentContext && (
                  <div className="neo-border-t pt-4">
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2">TEST_INQUIRY</label>
                    <div className="flex gap-2">
                      <Input
                        id="testInquiry"
                        value={testInquiry}
                        onChange={e => setTestInquiry(e.target.value)}
                        placeholder="Type something to test context..."
                        className="flex-grow !mb-0"
                      />
                      <Button onClick={handleTestContext} variant="secondary" size="sm" isLoading={isTestingContext}>
                        TEST
                      </Button>
                    </div>
                    {testResponse && (
                      <div className="mt-4 p-4 neo-border-sm bg-neo-secondary/20">
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-50">AGENT_RESPONSE:</p>
                        <p className="text-xs font-bold">{testResponse}</p>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleSaveFacebookConfig}
                  variant="primary"
                  className="w-full !py-4"
                  isLoading={isSavingConfig}
                  disabled={!activeAiAgentContext}
                >
                  SYNC_PAGE_KNOWLEDGE_BASE
                </Button>
              </div>
            </Card>

            <Card title="MARKETING_OS_MODULES" className="!p-8 neo-shadow-lg bg-white border-neo-accent">
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-neo-bg neo-border-sm">
                  <span className="text-xs font-black uppercase tracking-tight">Campaign Planner</span>
                  <span className="bg-neo-secondary text-[8px] font-black px-2 py-0.5 neo-border-sm uppercase">STABLE</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-neo-bg neo-border-sm">
                  <span className="text-xs font-black uppercase tracking-tight">Social Scheduler</span>
                  <span className="bg-neo-secondary text-[8px] font-black px-2 py-0.5 neo-border-sm uppercase">ACTIVE</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-neo-bg neo-border-sm">
                  <span className="text-xs font-black uppercase tracking-tight">Analytics Terminal</span>
                  <span className="bg-neo-accent text-white text-[8px] font-black px-2 py-0.5 neo-border-sm uppercase">CONNECTED</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-neo-bg neo-border-sm">
                  <span className="text-xs font-black uppercase tracking-tight">External MCP Bridge</span>
                  <span className="bg-neo-secondary text-[8px] font-black px-2 py-0.5 neo-border-sm uppercase">CONFIGURABLE</span>
                </div>
              </div>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
