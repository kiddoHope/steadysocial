export type ConversationStatus = 'none' | 'unread' | 'read';
export type CustomerStatus = 'New' | 'Inquiry' | 'Ordering' | 'Paid' | 'Shipped' | 'Completed';
export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface CustomerDetails {
  fullName?: string;
  contactNumber?: string;
  address?: string;
  email?: string;
}

export interface ConversationState {
  status: ConversationStatus;
  isAiDisabled: 'enabled' | 'disabled';
  isImportant: boolean;
  remarks: string;
  customerStatus: CustomerStatus;
  orderHistory: any[];
  customerDetails: CustomerDetails;
  tags: string[];
  sentiment?: Sentiment;
  autopilotMode?: 'continuous' | 'single_shot' | 'follow_up';
  followUpTone?: string;
}

const DB_NAME = 'steady-social-chat-db';
const CONVERSATION_STORE = 'conversation_statuses';
const BUSINESS_DATA_STORE = 'business_data';
const PRODUCT_DATA_STORE = 'product_data';
const DB_VERSION = 2;
const DEFAULT_PAGE_DATA_ID = 'current';
const PAGE_CONVERSATION_SEPARATOR = '::';

class ChatDBService {
  private db: IDBDatabase | null = null;

  public async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(new Error('Failed to open IndexedDB.'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(CONVERSATION_STORE)) {
          db.createObjectStore(CONVERSATION_STORE, { keyPath: 'conversationId' });
        }
        if (!db.objectStoreNames.contains(BUSINESS_DATA_STORE)) {
          db.createObjectStore(BUSINESS_DATA_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PRODUCT_DATA_STORE)) {
          db.createObjectStore(PRODUCT_DATA_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  private getPageDataId(pageId?: string | null): string {
    const normalized = String(pageId || '').trim();
    return normalized || DEFAULT_PAGE_DATA_ID;
  }

  private getScopedConversationId(conversationId: string, pageId?: string | null): string {
    const cleanConversationId = String(conversationId || '').trim();
    const cleanPageId = String(pageId || '').trim();

    if (!cleanPageId || cleanConversationId.includes(PAGE_CONVERSATION_SEPARATOR)) {
      return cleanConversationId;
    }

    return `${cleanPageId}${PAGE_CONVERSATION_SEPARATOR}${cleanConversationId}`;
  }

  private stripScopedConversationId(scopedConversationId: string, pageId?: string | null): string {
    const cleanPageId = String(pageId || '').trim();
    const prefix = cleanPageId ? `${cleanPageId}${PAGE_CONVERSATION_SEPARATOR}` : '';

    if (prefix && scopedConversationId.startsWith(prefix)) {
      return scopedConversationId.slice(prefix.length);
    }

    const separatorIndex = scopedConversationId.indexOf(PAGE_CONVERSATION_SEPARATOR);
    if (!cleanPageId && separatorIndex >= 0) {
      return scopedConversationId.slice(separatorIndex + PAGE_CONVERSATION_SEPARATOR.length);
    }

    return scopedConversationId;
  }

  private getDefaultState(): ConversationState {
    return {
      status: 'none',
      isAiDisabled: 'disabled',
      isImportant: false,
      remarks: '',
      customerStatus: 'New',
      orderHistory: [],
      customerDetails: {},
      tags: [],
      sentiment: undefined,
      autopilotMode: 'continuous',
      followUpTone: 'warm',
    };
  }

  private normalizeState(stateFromDb: any = {}): ConversationState {
    const { conversationId: _convId, pageId: _pageId, rawConversationId: _rawConversationId, ...cleanState } = stateFromDb || {};

    return {
      ...this.getDefaultState(),
      ...cleanState,
    };
  }

  private async getAndUpdateState(
    conversationId: string,
    updateFn: (state: ConversationState) => Partial<ConversationState>,
    pageId?: string | null
  ): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(CONVERSATION_STORE, 'readwrite');
      const store = transaction.objectStore(CONVERSATION_STORE);
      const scopedConversationId = this.getScopedConversationId(conversationId, pageId);
      const cleanPageId = String(pageId || '').trim();

      const writeState = (existingState: any = {}) => {
        const currentState = this.normalizeState(existingState);
        const updates = updateFn(currentState);
        const newState = { ...currentState, ...updates };

        const putRequest = store.put({
          conversationId: scopedConversationId,
          rawConversationId: conversationId,
          pageId: cleanPageId || undefined,
          ...newState,
        });

        putRequest.onsuccess = () => resolve();
        putRequest.onerror = e => {
          console.error('Failed to update state:', (e.target as any).error);
          reject(new Error('Could not save state to the database.'));
        };
      };

      const getRequest = store.get(scopedConversationId);

      getRequest.onsuccess = () => {
        if (getRequest.result || !cleanPageId) {
          writeState(getRequest.result || {});
          return;
        }

        // Backward compatibility: seed a page-scoped state from the legacy unscoped row.
        const legacyRequest = store.get(conversationId);
        legacyRequest.onsuccess = () => writeState(legacyRequest.result || {});
        legacyRequest.onerror = () => writeState({});
      };

      getRequest.onerror = e => {
        console.error('Failed to get conversation state for update:', (e.target as any).error);
        reject(new Error('Could not read conversation state.'));
      };
    });
  }

  public async setStatus(conversationId: string, status: ConversationStatus, pageId?: string | null): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ status }), pageId);
  }

  public async toggleAi(conversationId: string, aiState: 'enabled' | 'disabled', pageId?: string | null): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ isAiDisabled: aiState }), pageId);
  }

  public async toggleImportant(conversationId: string, isImportant: boolean, pageId?: string | null): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ isImportant }), pageId);
  }

  public async saveRemarks(conversationId: string, remarks: string, pageId?: string | null): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ remarks }), pageId);
  }

  public async saveCustomerStatus(conversationId: string, customerStatus: CustomerStatus, pageId?: string | null): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ customerStatus }), pageId);
  }

  public async saveCustomerDetails(conversationId: string, details: CustomerDetails, pageId?: string | null): Promise<void> {
    await this.getAndUpdateState(
      conversationId,
      state => ({ customerDetails: { ...(state.customerDetails || {}), ...details } }),
      pageId
    );
  }

  public async saveTags(conversationId: string, tags: string[], pageId?: string | null): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ tags }), pageId);
  }

  public async saveSentiment(conversationId: string, sentiment: Sentiment | undefined, pageId?: string | null): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ sentiment }), pageId);
  }

  public async saveAutopilotMode(conversationId: string, autopilotMode: 'continuous' | 'single_shot' | 'follow_up', pageId?: string | null): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ autopilotMode }), pageId);
  }

  public async saveFollowUpTone(conversationId: string, followUpTone: string, pageId?: string | null): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ followUpTone }), pageId);
  }

  public async getConversationState(conversationId: string, pageId?: string | null): Promise<ConversationState> {
    if (!this.db) await this.init();

    return new Promise(resolve => {
      const transaction = this.db!.transaction(CONVERSATION_STORE, 'readonly');
      const store = transaction.objectStore(CONVERSATION_STORE);
      const scopedConversationId = this.getScopedConversationId(conversationId, pageId);
      const cleanPageId = String(pageId || '').trim();

      const readScoped = store.get(scopedConversationId);

      readScoped.onsuccess = () => {
        if (readScoped.result || !cleanPageId) {
          resolve(this.normalizeState(readScoped.result));
          return;
        }

        const readLegacy = store.get(conversationId);
        readLegacy.onsuccess = () => resolve(this.normalizeState(readLegacy.result));
        readLegacy.onerror = () => resolve(this.getDefaultState());
      };

      readScoped.onerror = () => {
        console.error('Failed to get state:', readScoped.error);
        resolve(this.getDefaultState());
      };
    });
  }

  public async getAllConversationStates(pageId?: string | null): Promise<Record<string, ConversationState>> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(CONVERSATION_STORE, 'readonly');
      const store = transaction.objectStore(CONVERSATION_STORE);
      const request = store.getAll();
      const cleanPageId = String(pageId || '').trim();

      request.onsuccess = () => {
        const states: Record<string, ConversationState> = {};

        request.result.forEach(item => {
          const conversationId = String(item.conversationId || '');
          const itemPageId = String(item.pageId || '').trim();
          const belongsToPage = cleanPageId
            ? itemPageId === cleanPageId || conversationId.startsWith(`${cleanPageId}${PAGE_CONVERSATION_SEPARATOR}`)
            : true;

          if (!belongsToPage) return;

          const rawConversationId = item.rawConversationId || this.stripScopedConversationId(conversationId, cleanPageId);
          states[rawConversationId] = this.normalizeState(item);
        });

        resolve(states);
      };

      request.onerror = () => {
        console.error('Failed to get all states:', request.error);
        reject(new Error('Could not retrieve states from the database.'));
      };
    });
  }

  private async performWriteTransaction<T>(
    storeName: string,
    operation: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      request.onsuccess = () => resolve();
      request.onerror = e => {
        console.error(`Failed to write to ${storeName}:`, (e.target as any).error);
        reject(new Error(`Could not write to store ${storeName}.`));
      };
    });
  }

  private async performReadTransaction<T>(
    storeName: string,
    operation: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = e => {
        console.error(`Failed to read from ${storeName}:`, (e.target as any).error);
        reject(new Error(`Could not read from store ${storeName}.`));
      };
    });
  }

  private async getPageScopedData(storeName: string, pageId?: string | null): Promise<any | null> {
    const pageDataId = this.getPageDataId(pageId);
    const pageResult = await this.performReadTransaction<{ id: string; data: any }>(
      storeName,
      store => store.get(pageDataId)
    ).catch(() => null);

    if (pageResult?.data) return pageResult.data;

    if (pageDataId !== DEFAULT_PAGE_DATA_ID) {
      const fallbackResult = await this.performReadTransaction<{ id: string; data: any }>(
        storeName,
        store => store.get(DEFAULT_PAGE_DATA_ID)
      ).catch(() => null);

      return fallbackResult?.data || null;
    }

    return null;
  }

  public async saveBusinessData(data: any, pageId?: string | null): Promise<void> {
    const id = this.getPageDataId(pageId);
    return this.performWriteTransaction(BUSINESS_DATA_STORE, store =>
      store.put({ id, pageId: id === DEFAULT_PAGE_DATA_ID ? undefined : id, data })
    );
  }

  public async getBusinessData(pageId?: string | null): Promise<any | null> {
    return this.getPageScopedData(BUSINESS_DATA_STORE, pageId);
  }

  public async saveProductData(data: any, pageId?: string | null): Promise<void> {
    const id = this.getPageDataId(pageId);
    return this.performWriteTransaction(PRODUCT_DATA_STORE, store =>
      store.put({ id, pageId: id === DEFAULT_PAGE_DATA_ID ? undefined : id, data })
    );
  }

  public async getProductData(pageId?: string | null): Promise<any | null> {
    return this.getPageScopedData(PRODUCT_DATA_STORE, pageId);
  }
}

export const chatDbService = new ChatDBService();
