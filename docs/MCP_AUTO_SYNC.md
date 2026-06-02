/**
 * MCP Data Sync Documentation
 * 
 * This document describes how auto-update and MCP data sync works in SteadySocial.
 */

# MCP Data Auto-Sync System

## Overview

The MCP Data Auto-Sync system provides real-time synchronization of data from the MCP server to the frontend application. This ensures that when the backend/MCP adds new data, the UI automatically reflects these changes without requiring manual refresh.

## Features

### 1. **Auto-Update Hook** (`useAutoUpdateData`)
- **Location**: `hooks/useAutoUpdateData.ts`
- **Purpose**: Provides automatic polling and data refresh for any async function
- **Features**:
  - Configurable polling interval (default: 5 seconds)
  - Change detection to identify new/modified data
  - Callbacks for update start, complete, error, and data change
  - Automatic cleanup on unmount
  - Update count tracking
  - Formatted last-updated time

### 2. **MCP Data Sync Service** (`mcpDataSyncService`)
- **Location**: `services/mcpDataSyncService.ts`
- **Purpose**: Centralized service for managing all MCP data synchronization
- **Capabilities**:
  - Sync individual data sources (scheduler history, campaigns, FB settings, planning files)
  - Sync all data sources simultaneously
  - Subscriber pattern for real-time updates
  - Data caching for performance
  - Auto-sync with configurable intervals
  - Comprehensive sync status tracking

### 3. **Tactical Timeline Auto-Sync** (Scheduler Page)
- **Location**: `pages/FacebookSchedulerPage.tsx`
- **Features**:
  - Real-time sync indicator showing IDLE, SYNCING, SYNCED, or ERROR states
  - Toggle auto-sync on/off
  - Configurable sync interval (3s, 5s, 10s, 30s, 1m)
  - Sync count badge
  - Last sync timestamp
  - Visual feedback with colors and animations

## Usage Examples

### Using useAutoUpdateData Hook

```tsx
import { useAutoUpdateData } from '../hooks/useAutoUpdateData';
import { dbGetSchedulerHistory } from '../services/campaignService';

export const MyComponent = () => {
  const {
    isUpdating,
    lastUpdated,
    updateCount,
    getFormattedLastUpdated,
    update,
    startPolling,
    stopPolling,
  } = useAutoUpdateData(
    dbGetSchedulerHistory,
    {
      pollInterval: 5000, // 5 seconds
      enabled: true,
      onUpdateStart: () => console.log('Update starting'),
      onUpdateComplete: (data) => console.log('Update complete', data),
      onUpdateError: (error) => console.log('Update error', error),
      onDataChange: (data) => console.log('Data changed', data),
    }
  );

  return (
    <div>
      <p>Updating: {isUpdating ? 'Yes' : 'No'}</p>
      <p>Last Updated: {getFormattedLastUpdated()}</p>
      <p>Update Count: {updateCount}</p>
      <button onClick={update}>Manual Update</button>
      <button onClick={startPolling}>Start Auto-Update</button>
      <button onClick={stopPolling}>Stop Auto-Update</button>
    </div>
  );
};
```

### Using MCP Data Sync Service

```tsx
import { mcpDataSyncService } from '../services/mcpDataSyncService';

// Manual sync
const result = await mcpDataSyncService.syncSchedulerHistory();
if (result.success) {
  console.log(`Synced ${result.itemsCount} items`);
}

// Subscribe to updates
const unsubscribe = mcpDataSyncService.subscribe('schedulerHistory', (data) => {
  console.log('Scheduler history updated:', data);
  // Update your component state here
});

// Auto-sync
mcpDataSyncService.startAutoSync('schedulerHistory', 5000); // Every 5 seconds

// Get sync status
const status = mcpDataSyncService.getSyncStatus('schedulerHistory');
console.log(`Last sync: ${status?.lastSync}`);
console.log(`Sync count: ${status?.syncCount}`);

// Cleanup
unsubscribe();
mcpDataSyncService.stopAutoSync('schedulerHistory');
```

## Integration Points

### 1. **Scheduler Page** (Facebook Scheduler)
- Auto-syncs scheduler history
- Shows real-time sync indicator
- Displays last sync timestamp
- Configurable sync interval

### 2. **Campaign Page** (Future)
- Can auto-sync campaigns
- Real-time campaign updates from MCP

### 3. **Planning Page** (Future)
- Can auto-sync planning files
- Real-time planning data updates

### 4. **Global App State** (Future)
- Can use service in contexts for app-wide sync
- Provides centralized MCP sync management

## Data Sources

Current data sources that can be synced:

1. **Scheduler History**
   - API: `dbGetSchedulerHistory()`
   - Data: `SchedulerHistoryEntry[]`
   - Updates: Posts, tasks, implementations

2. **Campaigns**
   - API: `dbGetCampaigns()`
   - Data: `Campaign[]`
   - Updates: Campaign info, status

3. **Facebook Settings**
   - API: `dbGetFacebookSettings()`
   - Data: `FacebookSettings`
   - Updates: API credentials, page settings

4. **Planning Files**
   - API: `getPlanningFiles()`
   - Data: `PlanningItem[]`
   - Updates: Planning data, files

## Sync Indicators

### Visual States

| State | Icon | Color | Meaning |
|-------|------|-------|---------|
| IDLE | 🔄 (cloud) | gray | Ready to sync |
| SYNCING | 🔄 (spinner) | blue | Currently syncing |
| SYNCED | ✓ (check) | green | Recently synced |
| ERROR | ⚠️ (warning) | red | Sync failed |

### Auto-Updates Reset
- Synced indicator resets to IDLE after 2 seconds
- Error indicator resets after 3 seconds

## Performance Considerations

### Default Polling Intervals
- **3 seconds**: Real-time feel, higher server load
- **5 seconds**: Balanced (default)
- **10 seconds**: Conservative, lower server load
- **30 seconds**: Minimal sync
- **1 minute**: Very low overhead

### Recommendations
- Use 5-10 seconds for active pages (user is viewing)
- Use 30-60 seconds for background pages
- Use 1m+ for rarely-updated data
- Can manually trigger updates when needed

## Best Practices

1. **Component Cleanup**: Always unsubscribe and stop polling on unmount
2. **Error Handling**: Implement error callbacks to handle sync failures
3. **Interval Selection**: Choose intervals based on data freshness requirements
4. **User Control**: Let users toggle auto-sync and adjust intervals
5. **Visual Feedback**: Always show sync status to users
6. **Efficient Updates**: Only update component state when data actually changes

## Troubleshooting

### Auto-Sync Not Working
1. Check if `autoUpdateEnabled` is true
2. Verify polling interval is not too long
3. Check browser console for errors
4. Verify API endpoints are accessible

### High Server Load
1. Increase polling interval
2. Reduce number of data sources being synced
3. Disable auto-sync for non-critical data
4. Use manual sync triggers instead of continuous polling

### Stale Data
1. Decrease polling interval
2. Manually trigger updates more frequently
3. Check API responses for data correctness

## Future Enhancements

1. **WebSocket Support**: Replace polling with real-time WebSocket connections
2. **Delta Sync**: Only sync changed data instead of full data sets
3. **Intelligent Polling**: Adjust polling intervals based on recent change frequency
4. **Sync Batching**: Combine multiple data source syncs into single request
5. **Offline Support**: Queue updates when offline, sync when reconnected
6. **Analytics**: Track sync success rates and performance metrics

## API Reference

### useAutoUpdateData Hook

```typescript
interface UseAutoUpdateDataOptions {
  pollInterval?: number;
  enabled?: boolean;
  onUpdateStart?: () => void;
  onUpdateComplete?: (data: any) => void;
  onUpdateError?: (error: Error) => void;
  onDataChange?: (data: any) => void;
}

const {
  isUpdating: boolean;
  lastUpdated: Date | null;
  lastError: Error | null;
  updateCount: number;
  update: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  getFormattedLastUpdated: () => string;
} = useAutoUpdateData(fetchFunction, options);
```

### MCP Data Sync Service

```typescript
// Single sync
mcpDataSyncService.syncSchedulerHistory(): Promise<SyncResult<...>>
mcpDataSyncService.syncCampaigns(): Promise<SyncResult<...>>
mcpDataSyncService.syncFacebookSettings(): Promise<SyncResult<...>>
mcpDataSyncService.syncPlanningFiles(): Promise<SyncResult<...>>

// Batch sync
mcpDataSyncService.syncAll(): Promise<Map<string, SyncResult<...>>>

// Auto-sync
mcpDataSyncService.startAutoSync(dataSource, intervalMs): void
mcpDataSyncService.stopAutoSync(dataSource): void
mcpDataSyncService.stopAllAutoSync(): void

// Subscriptions
mcpDataSyncService.subscribe(dataSource, callback): () => void

// Status
mcpDataSyncService.getSyncStatus(dataSource): SyncStatus | null
mcpDataSyncService.getAllSyncStatuses(): Map<string, SyncStatus>
mcpDataSyncService.getCachedData(dataSource): any | null

// Cleanup
mcpDataSyncService.clearCache(): void
mcpDataSyncService.reset(): void
```
