/**
 * MCP Data Sync Service
 * Centralized service for managing auto-sync from MCP and backend services
 * Provides real-time data updates across the entire application
 */

import {
  dbGetSchedulerHistory,
  SchedulerHistoryEntry,
} from './campaignService';
import {
  dbGetCampaigns,
  Campaign,
} from './campaignService';
import { dbGetFacebookSettings, FacebookSettings } from './settingsService';
import { getPlanningFiles, PlanningItem } from './planningService';

interface SyncResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  timestamp: Date;
  itemsCount?: number;
}

interface SyncStatus {
  issyncing: boolean;
  lastSync: Date | null;
  syncCount: number;
  errors: Map<string, Error>;
}

class MCPDataSyncService {
  private syncStatus: Map<string, SyncStatus> = new Map();
  private subscribers: Map<string, Set<(data: any) => void>> = new Map();
  private cache: Map<string, { data: any; timestamp: Date }> = new Map();
  private syncIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor() {
    this.initializeSyncStatus();
  }

  private initializeSyncStatus() {
    const dataKeys = ['schedulerHistory', 'campaigns', 'facebookSettings', 'planningFiles'];
    dataKeys.forEach(key => {
      this.syncStatus.set(key, {
        issyncing: false,
        lastSync: null,
        syncCount: 0,
        errors: new Map(),
      });
    });
  }

  /**
   * Subscribe to data updates for a specific data source
   */
  subscribe(dataSource: string, callback: (data: any) => void): () => void {
    if (!this.subscribers.has(dataSource)) {
      this.subscribers.set(dataSource, new Set());
    }
    this.subscribers.get(dataSource)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(dataSource)?.delete(callback);
    };
  }

  /**
   * Notify all subscribers of data changes
   */
  private notifySubscribers(dataSource: string, data: any) {
    this.subscribers.get(dataSource)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in subscriber callback for ${dataSource}:`, error);
      }
    });
  }

  /**
   * Sync scheduler history from MCP
   */
  async syncSchedulerHistory(): Promise<SyncResult<SchedulerHistoryEntry[]>> {
    const dataSource = 'schedulerHistory';
    const status = this.syncStatus.get(dataSource)!;

    if (status.issyncing) {
      return {
        success: false,
        error: new Error('Already syncing scheduler history'),
        timestamp: new Date(),
      };
    }

    status.issyncing = true;

    try {
      const data = await dbGetSchedulerHistory();
      
      // Update cache
      this.cache.set(dataSource, { data, timestamp: new Date() });

      // Update status
      status.lastSync = new Date();
      status.syncCount++;
      status.errors.delete(dataSource);

      // Notify subscribers
      this.notifySubscribers(dataSource, data);

      console.log(`✓ Synced scheduler history: ${data.length} items`);

      return {
        success: true,
        data,
        timestamp: new Date(),
        itemsCount: data.length,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      status.errors.set(dataSource, err);
      console.error(`✗ Failed to sync scheduler history:`, err);

      return {
        success: false,
        error: err,
        timestamp: new Date(),
      };
    } finally {
      status.issyncing = false;
    }
  }

  /**
   * Sync campaigns from MCP
   */
  async syncCampaigns(): Promise<SyncResult<Campaign[]>> {
    const dataSource = 'campaigns';
    const status = this.syncStatus.get(dataSource)!;

    if (status.issyncing) {
      return {
        success: false,
        error: new Error('Already syncing campaigns'),
        timestamp: new Date(),
      };
    }

    status.issyncing = true;

    try {
      const data = await dbGetCampaigns();
      
      this.cache.set(dataSource, { data, timestamp: new Date() });
      status.lastSync = new Date();
      status.syncCount++;
      status.errors.delete(dataSource);

      this.notifySubscribers(dataSource, data);
      console.log(`✓ Synced campaigns: ${data.length} items`);

      return {
        success: true,
        data,
        timestamp: new Date(),
        itemsCount: data.length,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      status.errors.set(dataSource, err);
      console.error(`✗ Failed to sync campaigns:`, err);

      return {
        success: false,
        error: err,
        timestamp: new Date(),
      };
    } finally {
      status.issyncing = false;
    }
  }

  /**
   * Sync Facebook settings from MCP
   */
  async syncFacebookSettings(): Promise<SyncResult<FacebookSettings>> {
    const dataSource = 'facebookSettings';
    const status = this.syncStatus.get(dataSource)!;

    if (status.issyncing) {
      return {
        success: false,
        error: new Error('Already syncing Facebook settings'),
        timestamp: new Date(),
      };
    }

    status.issyncing = true;

    try {
      const data = await dbGetFacebookSettings();
      
      this.cache.set(dataSource, { data, timestamp: new Date() });
      status.lastSync = new Date();
      status.syncCount++;
      status.errors.delete(dataSource);

      this.notifySubscribers(dataSource, data);
      console.log(`✓ Synced Facebook settings`);

      return {
        success: true,
        data,
        timestamp: new Date(),
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      status.errors.set(dataSource, err);
      console.error(`✗ Failed to sync Facebook settings:`, err);

      return {
        success: false,
        error: err,
        timestamp: new Date(),
      };
    } finally {
      status.issyncing = false;
    }
  }

  /**
   * Sync planning files from MCP
   */
  async syncPlanningFiles(): Promise<SyncResult<PlanningItem[]>> {
    const dataSource = 'planningFiles';
    const status = this.syncStatus.get(dataSource)!;

    if (status.issyncing) {
      return {
        success: false,
        error: new Error('Already syncing planning files'),
        timestamp: new Date(),
      };
    }

    status.issyncing = true;

    try {
      const data = await getPlanningFiles('');
      
      this.cache.set(dataSource, { data, timestamp: new Date() });
      status.lastSync = new Date();
      status.syncCount++;
      status.errors.delete(dataSource);

      this.notifySubscribers(dataSource, data);
      console.log(`✓ Synced planning files: ${data.length} items`);

      return {
        success: true,
        data,
        timestamp: new Date(),
        itemsCount: data.length,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      status.errors.set(dataSource, err);
      console.error(`✗ Failed to sync planning files:`, err);

      return {
        success: false,
        error: err,
        timestamp: new Date(),
      };
    } finally {
      status.issyncing = false;
    }
  }

  /**
   * Sync all data sources simultaneously
   */
  async syncAll(): Promise<Map<string, SyncResult<any>>> {
    const results = new Map<string, SyncResult<any>>();

    console.log('🔄 Starting comprehensive MCP data sync...');

    const startTime = Date.now();

    try {
      const [schedulerResult, campaignsResult, fbSettingsResult, planningResult] = 
        await Promise.all([
          this.syncSchedulerHistory(),
          this.syncCampaigns(),
          this.syncFacebookSettings(),
          this.syncPlanningFiles(),
        ]);

      results.set('schedulerHistory', schedulerResult);
      results.set('campaigns', campaignsResult);
      results.set('facebookSettings', fbSettingsResult);
      results.set('planningFiles', planningResult);

      const duration = Date.now() - startTime;
      const successCount = Array.from(results.values()).filter(r => r.success).length;

      console.log(`✓ MCP sync complete: ${successCount}/${results.size} sources synced in ${duration}ms`);
    } catch (error) {
      console.error('✗ MCP sync failed:', error);
    }

    return results;
  }

  /**
   * Start auto-syncing a specific data source
   */
  startAutoSync(
    dataSource: 'schedulerHistory' | 'campaigns' | 'facebookSettings' | 'planningFiles',
    intervalMs: number = 5000
  ): void {
    // Clear existing interval if any
    if (this.syncIntervals.has(dataSource)) {
      clearInterval(this.syncIntervals.get(dataSource));
    }

    // Initial sync
    if (dataSource === 'schedulerHistory') {
      this.syncSchedulerHistory();
    } else if (dataSource === 'campaigns') {
      this.syncCampaigns();
    } else if (dataSource === 'facebookSettings') {
      this.syncFacebookSettings();
    } else if (dataSource === 'planningFiles') {
      this.syncPlanningFiles();
    }

    // Set up polling
    const interval = setInterval(() => {
      if (dataSource === 'schedulerHistory') {
        this.syncSchedulerHistory();
      } else if (dataSource === 'campaigns') {
        this.syncCampaigns();
      } else if (dataSource === 'facebookSettings') {
        this.syncFacebookSettings();
      } else if (dataSource === 'planningFiles') {
        this.syncPlanningFiles();
      }
    }, intervalMs);

    this.syncIntervals.set(dataSource, interval);
    console.log(`⏱️  Started auto-sync for ${dataSource} every ${intervalMs}ms`);
  }

  /**
   * Stop auto-syncing a specific data source
   */
  stopAutoSync(dataSource: string): void {
    if (this.syncIntervals.has(dataSource)) {
      clearInterval(this.syncIntervals.get(dataSource));
      this.syncIntervals.delete(dataSource);
      console.log(`⏹️  Stopped auto-sync for ${dataSource}`);
    }
  }

  /**
   * Stop all auto-sync operations
   */
  stopAllAutoSync(): void {
    this.syncIntervals.forEach((interval) => clearInterval(interval));
    this.syncIntervals.clear();
    console.log('⏹️  Stopped all auto-sync operations');
  }

  /**
   * Get cached data for a data source
   */
  getCachedData(dataSource: string): any | null {
    const cached = this.cache.get(dataSource);
    return cached ? cached.data : null;
  }

  /**
   * Get sync status for a data source
   */
  getSyncStatus(dataSource: string): SyncStatus | null {
    return this.syncStatus.get(dataSource) || null;
  }

  /**
   * Get all sync statuses
   */
  getAllSyncStatuses(): Map<string, SyncStatus> {
    return new Map(this.syncStatus);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🗑️  Cache cleared');
  }

  /**
   * Reset sync service
   */
  reset(): void {
    this.stopAllAutoSync();
    this.clearCache();
    this.subscribers.clear();
    this.initializeSyncStatus();
    console.log('🔄 MCP Data Sync Service reset');
  }
}

// Export singleton instance
export const mcpDataSyncService = new MCPDataSyncService();

export type { SyncResult, SyncStatus };
export default mcpDataSyncService;
