const BASE_URL = process.env.STEADYSOCIAL_API_URL || 'http://localhost:3001';

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: `HTTP ${response.status}` }));

    throw new Error(errorData.message || `Request failed: ${response.status}`);
  }

  if (response.status === 204 || options.method === 'DELETE') {
    return undefined as T;
  }

  const text = await response.text();

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export type CampaignStatus = 'ACTIVE' | 'DRAFT' | 'COMPLETED';

export interface Campaign {
  id: string;
  name: string;
  budget: string;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  createdAt?: number;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  actionValue?: string;
  isEnabled: boolean;
  runCount: number;
  createdAt: number;
}

export interface ContentCanvas {
  id: string;
  title?: string;
  status: string;
  createdBy: string;
  createdAt: number;
  items: any[];
  overallCustomPrompt?: string;
  overallTone?: string;
  overallPlatformContext?: string;
  overallImagePreview?: string | null;
}

export const steadysocialClient = {
  getHealth() {
    return apiRequest<any>('/');
  },

  getCampaigns() {
    return apiRequest<Campaign[]>('/campaigns');
  },

  createCampaign(input: {
    name: string;
    budget?: string;
    status?: CampaignStatus;
    startDate?: string;
    endDate?: string;
  }) {
    return apiRequest<Campaign>('/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        budget: input.budget || '₱0',
        status: input.status || 'DRAFT',
        startDate: input.startDate || new Date().toISOString().split('T')[0],
        endDate: input.endDate || '',
      }),
    });
  },

  updateCampaign(
    id: string,
    updates: Partial<{
      name: string;
      budget: string;
      status: CampaignStatus;
      startDate: string;
      endDate: string;
    }>
  ) {
    return apiRequest<Campaign>(`/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  deleteCampaign(id: string) {
    return apiRequest<void>(`/campaigns/${id}`, {
      method: 'DELETE',
    });
  },

  getAutomations() {
    return apiRequest<AutomationRule[]>('/automations');
  },

  createAutomation(input: {
    name: string;
    trigger?: string;
    action?: string;
    actionValue?: string;
    isEnabled?: boolean;
  }) {
    return apiRequest<AutomationRule>('/automations', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        trigger: input.trigger || 'NEW_MESSAGE_RECEIVED',
        action: input.action || 'SEND_AUTO_REPLY',
        actionValue: input.actionValue || '',
        isEnabled: input.isEnabled ?? true,
      }),
    });
  },

  updateAutomation(
    id: string,
    updates: Partial<{
      name: string;
      trigger: string;
      action: string;
      actionValue: string;
      isEnabled: boolean;
    }>
  ) {
    return apiRequest<AutomationRule>(`/automations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  deleteAutomation(id: string) {
    return apiRequest<void>(`/automations/${id}`, {
      method: 'DELETE',
    });
  },

  getCanvases() {
    return apiRequest<ContentCanvas[]>('/canvases');
  },

  getFacebookSettings() {
    return apiRequest<any>('/settings/facebook');
  },

  getSchedulerHistory() {
    return apiRequest<any[]>('/scheduler/history');
  },

  getPlanningFiles(path: string = '') {
    return apiRequest<any>(`/planning/files?path=${encodeURIComponent(path)}`);
  },

  searchPlanningWorkspace(query: string) {
    return apiRequest<any>('/planning/search', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  },

  getPlanningFileContent(path: string) {
    return apiRequest<any>(`/planning/file/content?path=${encodeURIComponent(path)}`);
  },

  createPlanningFile(input: {
    path: string;
    type: 'md' | 'docx' | 'xlsx' | 'csv' | 'html' | 'pdf';
    content: any;
    isBase64?: boolean;
  }) {
    return apiRequest<any>('/planning/file', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  createCanvas(input: {
    title?: string;
    status?: string;
    createdBy?: string;
    items?: any[];
    overallImagePreview?: string | null;
    overallCustomPrompt?: string;
    overallTone?: string;
    overallPlatformContext?: string;
  }) {
    return apiRequest<ContentCanvas>('/canvases', {
      method: 'POST',
      body: JSON.stringify({
        title: input.title || 'Untitled Canvas',
        status: input.status || 'draft',
        createdBy: input.createdBy || 'MCP Agent',
        initialItems: input.items || [],
        overallImagePreview: input.overallImagePreview || null,
        overallCustomPrompt: input.overallCustomPrompt || '',
        overallTone: input.overallTone || 'Friendly',
        overallPlatformContext: input.overallPlatformContext || 'General Platform',
        createdAt: Date.now(),
      }),
    });
  },

  updateCanvas(
    id: string,
    updates: Partial<{
      title: string;
      status: string;
      items: any[];
      overallImagePreview: string | null;
      overallCustomPrompt: string;
      overallTone: string;
      overallPlatformContext: string;
    }>
  ) {
    return apiRequest<ContentCanvas>(`/canvases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  deleteCanvas(id: string) {
    return apiRequest<void>(`/canvases/${id}`, {
      method: 'DELETE',
    });
  },

  createFacebookPost(input: {
    message?: string;
    link?: string;
    imageUrl?: string;
    imageDataUrl?: string;
  }) {
    if (input.imageUrl || input.imageDataUrl) {
      return apiRequest<any>('/facebook/photo', {
        method: 'POST',
        body: JSON.stringify({
          message: input.message || '',
          imageUrl: input.imageUrl,
          imageDataUrl: input.imageDataUrl,
          published: true,
        }),
      });
    }

    return apiRequest<any>('/facebook/feed', {
      method: 'POST',
      body: JSON.stringify({
        message: input.message || '',
        link: input.link || '',
        published: true,
      }),
    });
  },

  scheduleFacebookPost(input: {
    message?: string;
    link?: string;
    imageUrl?: string;
    imageDataUrl?: string;
    scheduledPublishTime: number; // Unix timestamp
  }) {
    if (input.imageUrl || input.imageDataUrl) {
      return apiRequest<any>('/facebook/photo', {
        method: 'POST',
        body: JSON.stringify({
          message: input.message || '',
          imageUrl: input.imageUrl,
          imageDataUrl: input.imageDataUrl,
          scheduled_publish_time: input.scheduledPublishTime,
        }),
      });
    }

    return apiRequest<any>('/facebook/feed', {
      method: 'POST',
      body: JSON.stringify({
        message: input.message || '',
        link: input.link || '',
        scheduled_publish_time: input.scheduledPublishTime,
      }),
    });
  },

  extractTasksFromPlanning(filePath: string) {
    return apiRequest<{
      success: boolean;
      taskCount: number;
      tasks: any[];
      sourceFile: string;
    }>('/planning/extract-tasks', {
      method: 'POST',
      body: JSON.stringify({ filePath }),
    });
  },

  createSchedulerEntry(entry: any) {
    return apiRequest<any>('/scheduler/history', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  },

  getBoards() {
    return apiRequest<{ success: boolean; boards: string[] }>('/boards');
  },

  getBoardState(name: string) {
    return apiRequest<any>(`/boards/${encodeURIComponent(name)}`);
  },

  updateBoardState(name: string, state: any) {
    return apiRequest<void>(`/boards/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(state),
    });
  },

  deleteBoard(name: string) {
    return apiRequest<void>(`/boards/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  },

  renameBoard(name: string, newName: string) {
    return apiRequest<void>(`/boards/${encodeURIComponent(name)}/rename`, {
      method: 'POST',
      body: JSON.stringify({ newName }),
    });
  },

  // ── CRM ───────────────────────────────────────────────────────────────
  getLeads() {
    return apiRequest<any[]>('/leads');
  },
};