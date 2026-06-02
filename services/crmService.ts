
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

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'WON' | 'LOST';
export type LeadSource = 'MESSENGER' | 'INSTAGRAM' | 'MANUAL' | 'REFERRAL' | 'WEBSITE' | 'FACEBOOK_ADS' | 'OTHER';

export interface Lead {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    age?: string | number;
    gender?: string;
    address?: string;
    company?: string;
    status: LeadStatus;
    source: LeadSource;
    value?: string;
    notes?: string;
    messengerConversationId?: string;
    fbLeadId?: string;
    fbFormId?: string;
    fbAdId?: string;
    fbSubmittedAt?: string;
    fbRawFields?: Record<string, string>;
    createdAt: number;
}

export const dbGetLeads = (): Promise<Lead[]> => apiRequest<Lead[]>('/leads');

export const dbCreateLead = (lead: Omit<Lead, 'id' | 'createdAt'>): Promise<Lead> =>
    apiRequest<Lead>('/leads', { method: 'POST', body: JSON.stringify(lead) });

export const dbUpdateLead = (id: string, updates: Partial<Lead>): Promise<Lead> =>
    apiRequest<Lead>(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const dbDeleteLead = (id: string): Promise<void> =>
    apiRequest<void>(`/leads/${id}`, { method: 'DELETE' });

// --- Facebook Lead Ads ---

export interface FbLeadForm {
    id: string;
    name: string;
    status: string;
    leads_count?: number;
    created_time?: string;
}

export const dbGetLeadForms = (pageId: string, accessToken: string): Promise<{ data: FbLeadForm[] }> =>
    apiRequest<{ data: FbLeadForm[] }>(`/facebook/lead-forms/${pageId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'x-access-token': accessToken },
    });

export const dbBulkImportLeads = (
    formId: string,
    accessToken: string,
    since?: number
): Promise<{ success: boolean; imported: number; skipped: number; leads: Lead[] }> =>
    apiRequest(`/facebook/leads/bulk-import`, {
        method: 'POST',
        body: JSON.stringify({ formId, accessToken, since }),
    });
