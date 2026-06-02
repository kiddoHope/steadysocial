
const baseURL = 'http://localhost:3001';

const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${baseURL}${path}`, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...options.headers },
        ...options,
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown API error.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
};

export type AutomationTrigger =
    | 'NEW_MESSAGE_RECEIVED'
    | 'NEW_LEAD_ADDED'
    | 'LEAD_STATUS_CHANGED'
    | 'CAMPAIGN_STARTED'
    | 'CAMPAIGN_ENDED'
    | 'DAILY_SCHEDULE';

export type AutomationAction =
    | 'SEND_AUTO_REPLY'
    | 'TAG_LEAD_HOT'
    | 'TAG_LEAD_COLD'
    | 'MOVE_LEAD_TO_QUALIFIED'
    | 'NOTIFY_TEAM'
    | 'ADD_TO_CAMPAIGN'
    | 'LOG_ACTIVITY';

export interface AutomationRule {
    id: string;
    name: string;
    trigger: AutomationTrigger;
    action: AutomationAction;
    actionValue?: string;
    isEnabled: boolean;
    runCount: number;
    createdAt: number;
}

export const dbGetAutomations = (): Promise<AutomationRule[]> =>
    apiRequest<AutomationRule[]>('/automations');

export const dbCreateAutomation = (
    rule: Omit<AutomationRule, 'id' | 'createdAt' | 'runCount'>
): Promise<AutomationRule> =>
    apiRequest<AutomationRule>('/automations', {
        method: 'POST',
        body: JSON.stringify({ ...rule, runCount: 0 }),
    });

export const dbUpdateAutomation = (id: string, updates: Partial<AutomationRule>): Promise<AutomationRule> =>
    apiRequest<AutomationRule>(`/automations/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const dbDeleteAutomation = (id: string): Promise<void> =>
    apiRequest<void>(`/automations/${id}`, { method: 'DELETE' });
