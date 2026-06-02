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
const DB_VERSION = 1;

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
        console.error("IndexedDB error:", request.error);
        reject(new Error("Failed to open IndexedDB."));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
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

  private async getAndUpdateState(
    conversationId: string,
    updateFn: (state: ConversationState) => Partial<ConversationState>
  ): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(CONVERSATION_STORE, 'readwrite');
      const store = transaction.objectStore(CONVERSATION_STORE);
      const getRequest = store.get(conversationId);

      getRequest.onsuccess = () => {
        const defaultState: ConversationState = {
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

        const existingState = getRequest.result || {};
        const { conversationId: _convId, ...stateFromDb } = existingState;

        const currentState: ConversationState = {
          ...defaultState,
          ...stateFromDb,
        };

        const updates = updateFn(currentState);
        const newState = { ...currentState, ...updates };

        const putRequest = store.put({ conversationId, ...newState });

        putRequest.onsuccess = () => resolve();
        putRequest.onerror = (e) => {
          console.error("Failed to update state:", (e.target as any).error);
          reject(new Error("Could not save state to the database."));
        };
      };
      getRequest.onerror = (e) => {
        console.error("Failed to get conversation state for update:", (e.target as any).error);
        reject(new Error("Could not read conversation state."));
      };
    });
  }

  public async setStatus(conversationId: string, status: ConversationStatus): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ status }));
  }

  public async toggleAi(conversationId: string, aiState: 'enabled' | 'disabled'): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ isAiDisabled: aiState }));
  }

  public async toggleImportant(conversationId: string, isImportant: boolean): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ isImportant }));
  }

  public async saveRemarks(conversationId: string, remarks: string): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ remarks }));
  }

  public async saveCustomerStatus(conversationId: string, customerStatus: CustomerStatus): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ customerStatus }));
  }

  public async saveCustomerDetails(conversationId: string, details: CustomerDetails): Promise<void> {
    await this.getAndUpdateState(conversationId, (state) => ({
      customerDetails: { ...(state.customerDetails || {}), ...details }
    }));
  }

  public async saveTags(conversationId: string, tags: string[]): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ tags }));
  }

  public async saveSentiment(conversationId: string, sentiment: Sentiment | undefined): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ sentiment }));
  }

  public async saveAutopilotMode(conversationId: string, autopilotMode: 'continuous' | 'single_shot' | 'follow_up'): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ autopilotMode }));
  }

  public async saveFollowUpTone(conversationId: string, followUpTone: string): Promise<void> {
    await this.getAndUpdateState(conversationId, () => ({ followUpTone }));
  }

  public async getConversationState(conversationId: string): Promise<ConversationState> {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db!.transaction(CONVERSATION_STORE, 'readonly');
      const store = transaction.objectStore(CONVERSATION_STORE);
      const request = store.get(conversationId);

      request.onsuccess = () => {
        const result = request.result;
        resolve({
          status: result?.status || 'none',
          isAiDisabled: result?.isAiDisabled || 'disabled',
          isImportant: result?.isImportant || false,
          remarks: result?.remarks || '',
          customerStatus: result?.customerStatus || 'New',
          orderHistory: result?.orderHistory || [],
          customerDetails: result?.customerDetails || {},
          tags: result?.tags || [],
          sentiment: result?.sentiment,
          autopilotMode: result?.autopilotMode || 'continuous',
          followUpTone: result?.followUpTone || 'warm',
        });
      };
      request.onerror = () => {
        console.error("Failed to get state:", request.error);
        resolve({
          status: 'none',
          isAiDisabled: 'disabled',
          isImportant: false,
          remarks: '',
          customerStatus: 'New',
          orderHistory: [],
          customerDetails: {},
          tags: [],
          sentiment: undefined
        });
      };
    });
  }

  public async getAllConversationStates(): Promise<Record<string, ConversationState>> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(CONVERSATION_STORE, 'readonly');
      const store = transaction.objectStore(CONVERSATION_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const states: Record<string, ConversationState> = {};
        request.result.forEach(item => {
          states[item.conversationId] = {
            status: item.status || 'none',
            isAiDisabled: item.isAiDisabled || 'disabled',
            isImportant: item.isImportant || false,
            remarks: item.remarks || '',
            customerStatus: item.customerStatus || 'New',
            orderHistory: item.orderHistory || [],
            customerDetails: item.customerDetails || {},
            tags: item.tags || [],
            sentiment: item.sentiment,
            autopilotMode: item.autopilotMode || 'continuous',
            followUpTone: item.followUpTone || 'warm',
          };
        });
        resolve(states);
      };

      request.onerror = () => {
        console.error("Failed to get all states:", request.error);
        reject(new Error("Could not retrieve states from the database."));
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
      request.onerror = (e) => {
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
      request.onerror = (e) => {
        console.error(`Failed to read from ${storeName}:`, (e.target as any).error);
        reject(new Error(`Could not read from store ${storeName}.`));
      };
    });
  }

  public async saveBusinessData(data: any): Promise<void> {
    return this.performWriteTransaction(BUSINESS_DATA_STORE, store =>
      store.put({ id: 'current', data })
    );
  }

  public async getBusinessData(): Promise<any | null> {
    const result = await this.performReadTransaction<{ id: string, data: any }>(
      BUSINESS_DATA_STORE,
      store => store.get('current')
    ).catch(() => null);
    return result?.data || null;
  }

  public async saveProductData(data: any): Promise<void> {
    return this.performWriteTransaction(PRODUCT_DATA_STORE, store =>
      store.put({ id: 'current', data })
    );
  }

  public async getProductData(): Promise<any | null> {
    const result = await this.performReadTransaction<{ id: string, data: any }>(
      PRODUCT_DATA_STORE,
      store => store.get('current')
    ).catch(() => null);
    return result?.data || null;
  }
}

export const chatDbService = new ChatDBService();
