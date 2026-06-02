import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Input from '../components/ui/Input';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { FacebookPage, FacebookSettings } from '../types';
import Button from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  dbGetFacebookSettings,
  dbSaveFacebookSettings,
  dbSaveAISettings,
} from '../services/settingsService';
import useFacebookSDK from '../hooks/useFacebookSDK';
import Alert from '../components/ui/Alert';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import { useAI } from '../contexts/AIContext';
import { AIProvider } from '../types';

type McpClientType = 'claude-desktop' | 'codex' | 'pi-coding-agent' | 'generic';

type BackendRouteStatus = 'unknown' | 'online' | 'offline';

interface McpConfigState {
  mcpServerPath: string;
  apiUrl: string;
  selectedClient: McpClientType;
}

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
  const { currentUser, updateUserProfile } = useAuth();
  const navigate = useNavigate();
  const {
    llmSettings,
    setLlmSettings,
    creativeModelLoaded,
    availableModels,
    generateChatResponse,
  } = useAI();

  const [initialFbSettings, setInitialFbSettings] = useState<FacebookSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  const [inputFbAppId, setInputFbAppId] = useState('');
  const [inputFbAccessToken, setInputFbAccessToken] = useState('');
  const [inputFbPageId, setInputFbPageId] = useState('');
  const [configuredFbAppId, setConfiguredFbAppId] = useState<string | null>(null);
  const [mainAppLoginStatus, setMainAppLoginStatus] = useState<'unknown' | 'connected' | 'not_authorized'>('unknown');
  const [connectedPageName, setConnectedPageName] = useState<string | null>(null);
  const [aiAgentContext, setAiAgentContext] = useState('');
  const [testInquiry, setTestInquiry] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [isTestingContext, setIsTestingContext] = useState(false);

  const [sdkTargetAppId, setSdkTargetAppId] = useState<string | undefined>(undefined);
  const [isFbProcessing, setIsFbProcessing] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [fbActionMessage, setFbActionMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [isSavingAIConfig, setIsSavingAIConfig] = useState(false);

  const [mcpConfig, setMcpConfig] = useState<McpConfigState>(() => getSavedMcpConfig());
  const [backendRouteStatus, setBackendRouteStatus] = useState<BackendRouteStatus>('unknown');
  const [isTestingMcpBackend, setIsTestingMcpBackend] = useState(false);
  const [mcpTestDetails, setMcpTestDetails] = useState('');
  const [mcpCopied, setMcpCopied] = useState(false);

  const generatedMcpConfig = useMemo(() => getMcpConfigText(mcpConfig), [mcpConfig]);

  useEffect(() => {
    const loadSettings = async () => {
      setIsLoadingSettings(true);
      try {
        const settings = await dbGetFacebookSettings();
        setInitialFbSettings(settings);
        setInputFbAppId(settings.appId || '');
        setInputFbAccessToken(settings.accessToken || '');
        setInputFbPageId(settings.pageId || '');
        setConfiguredFbAppId(settings.appId || null);
        setSdkTargetAppId(settings.appId || undefined);
        setAiAgentContext(settings.aiAgentContext || '');
      } catch (err) {
        console.error('Failed to load settings:', err);
        setFbActionMessage({ type: 'error', text: 'Could not load Facebook settings.' });
      } finally {
        setIsLoadingSettings(false);
      }
    };

    loadSettings();
  }, []);

  const { fbApi, error: sdkError } = useFacebookSDK(
    sdkTargetAppId,
    undefined,
    initialFbSettings?.accessToken
  );

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

  const handleSaveFacebookConfig = useCallback(async () => {
    if (!inputFbAppId.trim()) {
      setFbActionMessage({ type: 'error', text: 'Facebook App ID must be provided.' });
      return;
    }

    setIsSavingConfig(true);
    setFbActionMessage(null);

    try {
      const newSettingsData: Partial<FacebookSettings> = {
        appId: inputFbAppId.trim(),
        accessToken: inputFbAccessToken.trim(),
        pageId: inputFbPageId.trim(),
        aiAgentContext,
      };

      const savedSettings = await dbSaveFacebookSettings(newSettingsData);

      setInitialFbSettings(savedSettings);
      setConfiguredFbAppId(savedSettings.appId || null);

      if (!sdkTargetAppId && savedSettings.appId) {
        setSdkTargetAppId(savedSettings.appId);
      }

      setFbActionMessage({ type: 'success', text: 'Settings saved successfully.' });
    } catch (e) {
      console.error('Failed to save settings:', e);
      setFbActionMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setIsSavingConfig(false);
    }
  }, [
    inputFbAppId,
    inputFbAccessToken,
    inputFbPageId,
    aiAgentContext,
    sdkTargetAppId,
    configuredFbAppId,
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
      setAiAgentContext(content);
    };
    reader.readAsText(file);
  };

  const handleTestContext = async () => {
    if (!testInquiry.trim() || !aiAgentContext) return;

    setIsTestingContext(true);
    setTestResponse('');

    try {
      const prompt = `
CONTEXT_KNOWLEDGE_BASE:
${aiAgentContext}

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
    const token = initialFbSettings?.accessToken;
    const pageId = initialFbSettings?.pageId;

    if (!token) {
      setFbActionMessage({ type: 'error', text: 'Access token is required.' });
      return;
    }

    if (!pageId) {
      setFbActionMessage({ type: 'error', text: 'Page ID is required.' });
      return;
    }

    setIsFbProcessing(true);
    setFbActionMessage(null);

    try {
      const pageInfo = await fbApi<{ id: string; name: string }>(`/${pageId}?fields=id,name`);
      setMainAppLoginStatus('connected');
      setConnectedPageName(pageInfo.name || pageId);
      setFbActionMessage({ type: 'success', text: `Connected to page: ${pageInfo.name}` });
    } catch (err: any) {
      console.error('Connection test failed:', err);
      setMainAppLoginStatus('not_authorized');
      setFbActionMessage({ type: 'error', text: `Connection failed: ${err.message}` });
    } finally {
      setIsFbProcessing(false);
    }
  }, [fbApi, initialFbSettings?.accessToken, initialFbSettings?.pageId]);

  const handleDisconnect = () => {
    setMainAppLoginStatus('unknown');
    setConnectedPageName(null);
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
                  id="fbPageIdInput"
                  label="PAGE_ID"
                  value={inputFbPageId}
                  onChange={e => setInputFbPageId(e.target.value)}
                  disabled={isSavingConfig || isFbProcessing}
                  placeholder="Your Facebook Page ID"
                />
                <Input
                  id="fbAccessTokenInput"
                  label="PAGE_ACCESS_TOKEN"
                  value={inputFbAccessToken}
                  onChange={e => setInputFbAccessToken(e.target.value)}
                  disabled={isSavingConfig || isFbProcessing}
                  type="password"
                />
                <Button
                  onClick={handleSaveFacebookConfig}
                  disabled={isSavingConfig || isFbProcessing || !inputFbAppId.trim()}
                  variant="primary"
                  className="w-full !py-4"
                  isLoading={isSavingConfig}
                >
                  COMMIT_CONFIGURATION
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
                  <h3 className="text-sm font-black uppercase tracking-widest mb-4">GRAPH_API v23.0</h3>
                  <p className="text-[10px] font-bold text-neo-black/60 mb-4 uppercase tracking-wider">
                    Direct requests to graph.facebook.com/{'{pageId}'} — No SDK required
                  </p>
                  {connectedPageName && mainAppLoginStatus === 'connected' && (
                    <div className="p-3 neo-border-sm bg-neo-secondary mb-4 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest">LINKED_PAGE:</span>
                      <span className="font-black uppercase text-sm">{connectedPageName}</span>
                    </div>
                  )}
                  {mainAppLoginStatus !== 'connected' ? (
                    <Button
                      onClick={handleConnect}
                      variant="primary"
                      className="w-full py-4"
                      disabled={!initialFbSettings?.accessToken || !initialFbSettings?.pageId}
                      isLoading={isFbProcessing}
                    >
                      TEST_CONNECTION
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
                <div className="p-4 neo-border-sm bg-neo-muted">
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-2">UPLOAD_CONTEXT (.MD)</label>
                  <input
                    type="file"
                    accept=".md"
                    onChange={handleFileUpload}
                    className="block w-full text-xs text-neo-black file:mr-4 file:py-2 file:px-4 file:neo-border-sm file:bg-neo-black file:text-white file:font-black file:uppercase file:text-[10px] hover:file:bg-neo-accent cursor-pointer"
                  />
                </div>

                {aiAgentContext && (
                  <div className="space-y-4">
                    <div className="p-4 neo-border-sm bg-neo-bg max-h-40 overflow-y-auto">
                      <pre className="text-[10px] font-bold whitespace-pre-wrap">{aiAgentContext}</pre>
                    </div>

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
                  </div>
                )}

                <Button
                  onClick={handleSaveFacebookConfig}
                  variant="primary"
                  className="w-full !py-4"
                  isLoading={isSavingConfig}
                  disabled={!aiAgentContext}
                >
                  SYNC_KNOWLEDGE_BASE
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
