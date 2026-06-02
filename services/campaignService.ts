
const baseURL = "http://localhost:3001";

const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    try {
        const response = await fetch(`${baseURL}${path}`, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        if (!response.ok) {
            const errorData = await response
                .json()
                .catch(() => ({ message: 'An unknown API error occurred.' }));

            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        // DELETE and 204 responses usually have no JSON body.
        if (response.status === 204 || options.method === 'DELETE') {
            return undefined as T;
        }

        const text = await response.text();

        if (!text) {
            return undefined as T;
        }

        return JSON.parse(text) as T;
    } catch (error) {
        console.error('API Request Failed:', error);
        throw error;
    }
};

export interface Campaign {
    id: string;
    name: string;
    budget: string;
    status: 'ACTIVE' | 'DRAFT' | 'COMPLETED';
    startDate: string;
    endDate: string;
    createdAt?: number;
}

export interface SchedulerHistoryEntry {
    id: string;
    text: string;
    time: string;
    page: string;
    status: 'PUBLISHED' | 'SCHEDULED' | 'PENDING' | 'DUE' | 'COMPLETE';
    recordedAt?: number;
    // Expanded Orchestration fields
    type?: 'POST' | 'TASK' | 'IMPLEMENTATION';
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    milestones?: { label: string; completed: boolean }[];
    implementationFile?: string;
    completionPercentage?: number;
    // Custom tags for categorization (added for user/MCP tagging)
    tags?: string[];
}

export const dbGetCampaigns = async (): Promise<Campaign[]> => {
    return apiRequest<Campaign[]>('/campaigns');
};

export const dbCreateCampaign = async (campaign: Partial<Campaign>): Promise<Campaign> => {
    return apiRequest<Campaign>('/campaigns', {
        method: 'POST',
        body: JSON.stringify(campaign),
    });
};

export const dbUpdateCampaign = async (id: string, updates: Partial<Campaign>): Promise<Campaign> => {
    return apiRequest<Campaign>(`/campaigns/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
};

export const dbDeleteCampaign = async (id: string): Promise<void> => {
    return apiRequest<void>(`/campaigns/${id}`, {
        method: 'DELETE',
    });
};

export const dbGetSchedulerHistory = async (): Promise<SchedulerHistoryEntry[]> => {
    return apiRequest<SchedulerHistoryEntry[]>('/scheduler/history');
};

export const dbAddSchedulerHistory = async (entry: Partial<SchedulerHistoryEntry>): Promise<SchedulerHistoryEntry> => {
    return apiRequest<SchedulerHistoryEntry>('/scheduler/history', {
        method: 'POST',
        body: JSON.stringify(entry),
    });
};

export const dbUpdateSchedulerHistory = async (id: string, updates: Partial<SchedulerHistoryEntry>): Promise<SchedulerHistoryEntry> => {
    return apiRequest<SchedulerHistoryEntry>(`/scheduler/history/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
};

export const dbDeleteSchedulerHistory = async (id: string): Promise<void> => {
    return apiRequest<void>(`/scheduler/history/${id}`, {
        method: 'DELETE',
    });
};
