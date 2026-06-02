import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FacebookSettings, FacebookPage } from '../types';
import { dbGetFacebookSettings } from '../services/settingsService';
import useFacebookSDK from '../hooks/useFacebookSDK';
import { useAutoUpdateData } from '../hooks/useAutoUpdateData';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Alert from '../components/ui/Alert';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { 
  dbGetSchedulerHistory, 
  dbAddSchedulerHistory, 
  dbUpdateSchedulerHistory,
  dbDeleteSchedulerHistory,
  SchedulerHistoryEntry 
} from '../services/campaignService';
import { getPlanningFiles, PlanningItem } from '../services/planningService';
import SearchableSelect from '../components/ui/SearchableSelect';

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const FacebookSchedulerPage: React.FC = () => {
  const [fbSettings, setFbSettings] = useState<FacebookSettings | null>(null);
  const [fbPages, setFbPages] = useState<FacebookPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<FacebookPage | null>(null);
  const [postText, setPostText] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [scheduledPosts, setScheduledPosts] = useState<SchedulerHistoryEntry[]>([]);

  // Extended Orchestration States
  const [orchestrationType, setOrchestrationType] = useState<'POST' | 'TASK' | 'IMPLEMENTATION'>('POST');
  const [taskPriority, setTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [milestones, setMilestones] = useState<{ label: string; completed: boolean }[]>([]);
  const [newMilestoneText, setNewMilestoneText] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');
  const [planningFiles, setPlanningFiles] = useState<PlanningItem[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'POST' | 'TASK' | 'IMPLEMENTATION'>('ALL');
  const [selectedSchedulerItem, setSelectedSchedulerItem] = useState<SchedulerHistoryEntry | null>(null);
  const [isEditingSelected, setIsEditingSelected] = useState(false);
  const [selectedEditItem, setSelectedEditItem] = useState<SchedulerHistoryEntry | null>(null);

  // Pagination & Sorting states for Tactical Timeline History
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<'type' | 'text' | 'priority' | 'page' | 'time' | 'status' | 'completionPercentage'>('time');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'SCHEDULED' | 'PENDING' | 'DUE' | 'COMPLETE'>('ALL');
  const [tagFilter, setTagFilter] = useState<string>('');

  // Auto-update states for MCP data sync
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [autoUpdateInterval, setAutoUpdateInterval] = useState(5000); // 5 seconds
  const [lastMCPSync, setLastMCPSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncIndicator, setSyncIndicator] = useState<'idle' | 'syncing' | 'updated' | 'error'>('idle');

  // Calendar & Printing states
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-11
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState<'month' | 'year'>('month');
  const [printWithTasks, setPrintWithTasks] = useState(true);
  const [showComposer, setShowComposer] = useState(false);

  // Custom print color legend states
  const [printPostColor, setPrintPostColor] = useState('#bfdbfe');
  const [printPostLabel, setPrintPostLabel] = useState('Post');
  const [printTaskColor, setPrintTaskColor] = useState('#bbf7d0');
  const [printTaskLabel, setPrintTaskLabel] = useState('Task');
  const [printPlanColor, setPrintPlanColor] = useState('#fecaca');
  const [printPlanLabel, setPrintPlanLabel] = useState('Plan');

  // Custom user-defined print legends
  const [customLegends, setCustomLegends] = useState<{ id: string; label: string; color: string }[]>([]);

  const handleAddCustomLegend = () => {
    setCustomLegends(prev => [...prev, { id: Date.now().toString(), label: '', color: '#e2e8f0' }]);
  };

  const handleRemoveCustomLegend = (id: string) => {
    setCustomLegends(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateCustomLegend = (id: string, fields: Partial<{ label: string; color: string }>) => {
    setCustomLegends(prev => prev.map(item => item.id === id ? { ...item, ...fields } : item));
  };

  const getPrintPostColor = (p: SchedulerHistoryEntry) => {
    const matchingCustom = customLegends.find(legend => 
      legend.label.trim() !== '' && 
      p.text.toLowerCase().includes(legend.label.trim().toLowerCase())
    );
    if (matchingCustom) {
      return matchingCustom.color;
    }
    if (p.type === 'TASK') return printTaskColor;
    if (p.type === 'IMPLEMENTATION') return printPlanColor;
    return printPostColor;
  };

  // References
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Auto-dismiss handling alerts after 1 second (1000ms)
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleDownloadPDF = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess('GENERATING_PDF_PAYLOAD...');

    try {
      const printContainer = document.querySelector('.print-only-container') as HTMLElement;
      if (!printContainer) {
        throw new Error('Print container not found');
      }

      // Temporarily show the print container off-screen so html2canvas can render it
      const originalStyle = printContainer.style.cssText;
      printContainer.style.cssText = `
        display: block !important;
        position: absolute !important;
        left: -9999px !important;
        top: 0 !important;
        width: 1120px !important;
        background: #FFFDF5 !important;
      `;

      // Render to canvas
      const canvas = await html2canvas(printContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#FFFDF5',
      });

      // Restore original style
      printContainer.style.cssText = originalStyle;

      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 297;
      const pageHeight = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (printType === 'year') {
        const monthPages = document.querySelectorAll('.print-month-page');
        if (monthPages.length > 0) {
          for (let i = 0; i < monthPages.length; i++) {
            const pageEl = monthPages[i] as HTMLElement;
            
            const origStyle = pageEl.style.cssText;
            pageEl.style.cssText = `
              display: block !important;
              position: absolute !important;
              left: -9999px !important;
              top: 0 !important;
              width: 1120px !important;
              background: #FFFDF5 !important;
            `;

            const pageCanvas = await html2canvas(pageEl, {
              scale: 2,
              useCORS: true,
              logging: false,
              backgroundColor: '#FFFDF5',
            });

            pageEl.style.cssText = origStyle;

            const pageImgData = pageCanvas.toDataURL('image/png');
            if (i > 0) {
              pdf.addPage();
            }
            
            const pHeight = (pageCanvas.height * imgWidth) / pageCanvas.width;
            pdf.addImage(pageImgData, 'PNG', 0, 0, imgWidth, Math.min(pHeight, pageHeight));
          }
        } else {
          pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
        }
      } else {
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
      }

      const filename = `SteadySocial_Calendar_${selectedYear}_${monthsList[selectedMonth].toLowerCase()}.pdf`;
      pdf.save(filename);
      setSuccess('PDF_DOWNLOADED_SUCCESSFULLY');
    } catch (err: any) {
      console.error('Failed to generate PDF:', err);
      setError(`PDF_GENERATION_FAILURE: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const monthsList = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
  ];

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await dbGetSchedulerHistory();
      setScheduledPosts(data.sort((a,b) => (b.recordedAt || 0) - (a.recordedAt || 0)));
    } catch (err: any) {
      console.error("Failed to load history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Auto-update hook for MCP data sync
  const {
    isUpdating: isAutoUpdating,
    lastUpdated: lastAutoUpdate,
    updateCount,
    getFormattedLastUpdated,
    stopPolling: stopAutoPolling,
  } = useAutoUpdateData(
    dbGetSchedulerHistory,
    {
      pollInterval: autoUpdateInterval,
      enabled: autoUpdateEnabled,
      onUpdateStart: () => {
        setIsSyncing(true);
        setSyncIndicator('syncing');
      },
      onUpdateComplete: (data) => {
        setScheduledPosts(data.sort((a: SchedulerHistoryEntry, b: SchedulerHistoryEntry) => (b.recordedAt || 0) - (a.recordedAt || 0)));
        setLastMCPSync(new Date());
        setSyncIndicator('updated');
        // Reset updated indicator after 2 seconds
        setTimeout(() => setSyncIndicator('idle'), 2000);
        setIsSyncing(false);
      },
      onUpdateError: (error) => {
        console.error('MCP Sync Error:', error);
        setSyncIndicator('error');
        setIsSyncing(false);
        setTimeout(() => setSyncIndicator('idle'), 3000);
      },
      onDataChange: (data) => {
        console.log('Scheduler history updated from MCP:', data);
        setSuccess(`DATA_SYNCED_FROM_MCP: ${data.length} items`);
      },
    }
  );

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await dbGetFacebookSettings();
        setFbSettings(settings);
      } catch (err) {
        console.error("Failed to load FB settings:", err);
      }
    };
    const loadPlanFiles = async () => {
      try {
        const files = await getPlanningFiles('');
        setPlanningFiles(files.filter(f => f.type === 'file'));
      } catch (err) {
        console.error("Failed to load planning files:", err);
      }
    };
    loadSettings();
    loadHistory();
    loadPlanFiles();
  }, []);

  const { fbApi } = useFacebookSDK(
    fbSettings?.appId,
    undefined,
    fbSettings?.accessToken
  );

  // Auto-connect when we have an access token and page ID
  useEffect(() => {
    if (fbSettings?.accessToken && fbSettings?.pageId && fbApi && !isLoggedIn) {
      fbApi<FacebookPage>(`/${fbSettings.pageId}?fields=id,name`)
        .then(pageInfo => {
          const page: FacebookPage = { id: pageInfo.id, name: pageInfo.name, access_token: fbSettings.accessToken };
          setFbPages([page]);
          setSelectedPage(page);
          setIsLoggedIn(true);
        })
        .catch(err => {
          console.error('Error connecting to page:', err);
        });
    }
  }, [fbSettings?.accessToken, fbSettings?.pageId, fbApi, isLoggedIn]);

  // Sync live scheduled posts from actual Meta / Facebook page
  const syncScheduledPosts = useCallback(async () => {
    if (!selectedPage || !fbApi) return;
    try {
      const response = await fbApi<{ data: any[] }>(
        `/${selectedPage.id}/scheduled_posts`,
        'get'
      );
      
      if (response && response.data) {
        const liveScheduled = response.data.map(post => {
          const scheduledTime = post.scheduled_publish_time 
            ? new Date(post.scheduled_publish_time * 1000).toISOString()
            : post.created_time;
            
          return {
            id: post.id,
            text: post.message || '[MEDIA/ATTACHMENT]',
            time: scheduledTime,
            page: selectedPage.name,
            status: 'SCHEDULED' as const,
            recordedAt: post.scheduled_publish_time 
              ? post.scheduled_publish_time * 1000 
              : new Date(post.created_time).getTime(),
            type: 'POST' as const
          };
        });

        setScheduledPosts(prev => {
          const merged = [...prev];
          liveScheduled.forEach(livePost => {
            const exists = merged.some(p => p.id === livePost.id || (p.text === livePost.text && Math.abs(new Date(p.time).getTime() - new Date(livePost.time).getTime()) < 60000));
            if (!exists) {
              merged.push(livePost);
            }
          });
          return merged.sort((a, b) => (b.recordedAt || 0) - (a.recordedAt || 0));
        });
      }
    } catch (err) {
      console.error('Failed to sync live scheduled posts from Facebook:', err);
    }
  }, [selectedPage, fbApi]);

  useEffect(() => {
    if (selectedPage && isLoggedIn) {
      syncScheduledPosts();
    }
  }, [selectedPage, isLoggedIn, syncScheduledPosts]);

  // Handle Milestones additions
  const handleAddMilestone = () => {
    if (!newMilestoneText.trim()) return;
    setMilestones([...milestones, { label: newMilestoneText.trim(), completed: false }]);
    setNewMilestoneText('');
  };

  const handleRemoveMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  // Main Submit handler (Orchestrator task/post/implementation adder)
  const handleScheduleOrchestration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postText.trim()) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const newEntry: Partial<SchedulerHistoryEntry> = {
        text: postText,
        time: scheduledTime || new Date().toISOString(),
        page: selectedPage?.name || 'STEADYSOCIAL CORE',
        status: scheduledTime ? 'SCHEDULED' : 'PUBLISHED',
        type: orchestrationType,
        priority: orchestrationType !== 'POST' ? taskPriority : undefined,
        milestones: orchestrationType !== 'POST' ? milestones : undefined,
        implementationFile: orchestrationType === 'IMPLEMENTATION' ? selectedFile : undefined,
        completionPercentage: orchestrationType !== 'POST' ? (milestones.length > 0 ? Math.round((milestones.filter(m => m.completed).length / milestones.length) * 100) : 0) : undefined
      };

      if (orchestrationType === 'POST') {
        if (isLoggedIn && selectedPage) {
          const params: any = {
            message: postText,
            access_token: selectedPage.access_token,
          };

          if (scheduledTime) {
            const unixTime = Math.floor(new Date(scheduledTime).getTime() / 1000);
            params.scheduled_publish_time = unixTime;
            params.published = false;
          }

          await fbApi(`/${selectedPage.id}/feed`, 'post', params);
          newEntry.status = scheduledTime ? 'SCHEDULED' : 'PUBLISHED';
        } else {
          throw new Error('Meta API token missing. Please configure Facebook settings to post live content.');
        }
      } else {
        // Local tactical task or file plan implementation
        newEntry.status = 'PENDING';
      }

      // Attach tags if provided
      if (tags && tags.length > 0) newEntry.tags = tags;

      const saved = await dbAddSchedulerHistory(newEntry);
      setScheduledPosts([saved, ...scheduledPosts]);

      setSuccess(
        orchestrationType === 'POST'
          ? (scheduledTime ? 'POST_SCHEDULED_SUCCESSFULLY' : 'POST_PUBLISHED_SUCCESSFULLY')
          : (orchestrationType === 'TASK' ? 'TACTICAL_TASK_ADDED_SUCCESS' : 'PLAN_IMPLEMENTATION_STARTED')
      );

      // Reset
      setPostText('');
      setScheduledTime('');
      setMilestones([]);
      setSelectedFile('');
      setTags([]);
      setShowComposer(false);
    } catch (err: any) {
      console.error('Error posting/scheduling:', err);
      setError(`ORCHESTRATION_FAILURE: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete orchestration
  const handleDeleteOrchestration = async (id: string) => {
    setIsLoading(true);
    try {
      const itemToDelete = scheduledPosts.find(p => p.id === id);
      
      // If it is a live Facebook scheduled post (not local task/implementation), delete it on Facebook Graph too!
      if (itemToDelete && (!itemToDelete.type || itemToDelete.type === 'POST') && isLoggedIn && selectedPage) {
        // Live Facebook IDs are typical numeric identifiers
        const isLiveFbPost = /^\d+(_\d+)?$/.test(id);
        if (isLiveFbPost) {
          try {
            await fbApi(`/${id}`, 'delete');
          } catch (fbErr) {
            console.error('Failed to delete scheduled post from Facebook Graph:', fbErr);
          }
        }
      }

      await dbDeleteSchedulerHistory(id);
      setScheduledPosts(scheduledPosts.filter(p => p.id !== id));
      setSelectedSchedulerItem(null);
      setSuccess('ORCHESTRATION_REMOVED_SUCCESSFULLY');
    } catch (err: any) {
      setError(`DELETE_FAILURE: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle dynamic milestone checkbox on detail modal
  const handleToggleDetailMilestone = async (milestoneIndex: number) => {
    if (!selectedSchedulerItem) return;

    try {
      const updatedMilestones = [...(selectedSchedulerItem.milestones || [])];
      updatedMilestones[milestoneIndex] = {
        ...updatedMilestones[milestoneIndex],
        completed: !updatedMilestones[milestoneIndex].completed
      };

      const completedCount = updatedMilestones.filter(m => m.completed).length;
      const pct = updatedMilestones.length > 0 ? Math.round((completedCount / updatedMilestones.length) * 100) : 0;

      // Auto-complete when all milestones done; revert to PENDING if unchecked
      const allDone = updatedMilestones.length > 0 && completedCount === updatedMilestones.length;
      const isTaskType = selectedSchedulerItem.type === 'TASK' || selectedSchedulerItem.type === 'IMPLEMENTATION';
      let newStatus = selectedSchedulerItem.status;
      if (isTaskType) {
        if (allDone) {
          newStatus = 'COMPLETE';
        } else if (selectedSchedulerItem.status === 'COMPLETE') {
          newStatus = 'PENDING';
        }
      }

      const updatedItem = {
        ...selectedSchedulerItem,
        milestones: updatedMilestones,
        completionPercentage: pct,
        status: newStatus,
      };

      const saved = await dbUpdateSchedulerHistory(selectedSchedulerItem.id, updatedItem);
      
      // Update history state
      setScheduledPosts(scheduledPosts.map(p => p.id === saved.id ? saved : p));
      setSelectedSchedulerItem(saved);
      setSuccess(allDone && isTaskType ? 'TASK_AUTO_COMPLETED' : 'MILESTONE_UPDATED');
    } catch (err: any) {
      setError(`CHECKPOINT_UPDATE_FAILURE: ${err.message}`);
    }
  };

  // Tag helpers for composer
  const handleAddTag = () => {
    const value = tagInput.trim();
    if (!value) return;
    if (!tags.includes(value)) setTags(prev => [...prev, value]);
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));

  // Calendar Generation Helpers
  const prevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(prev => prev - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(prev => prev + 1);
    }
  };

  const getDaysInMonth = (year: number, month: number) => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday, 1 = Monday
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    
    const days: { date: Date; isCurrentMonth: boolean; isToday: boolean }[] = [];
    
    // Trail of previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = prevMonthTotalDays - i;
      const date = new Date(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, day);
      days.push({ date, isCurrentMonth: false, isToday: false });
    }
    
    // Days of current month
    const today = new Date();
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      const isToday = today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;
      days.push({ date, isCurrentMonth: true, isToday });
    }
    
    // Lead of next month (grid sizing of 42 cells)
    const remainingCells = 42 - days.length;
    for (let n = 1; n <= remainingCells; n++) {
      const date = new Date(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, n);
      days.push({ date, isCurrentMonth: false, isToday: false });
    }
    
    return days;
  };

  // Helper to query scheduled items per date (including type filters!)
  const getPostsForDate = (date: Date) => {
    return scheduledPosts.filter(post => {
      // Apply filters
      if (filterType === 'POST' && (post.type && post.type !== 'POST')) return false;
      if (filterType === 'TASK' && post.type !== 'TASK') return false;
      if (filterType === 'IMPLEMENTATION' && post.type !== 'IMPLEMENTATION') return false;

      let postDate: Date;
      if (post.status === 'SCHEDULED' && post.time && post.time !== 'PUBLISHED_NOW') {
        postDate = new Date(post.time);
      } else if (post.recordedAt) {
        postDate = new Date(post.recordedAt);
      } else if (post.time && post.time !== 'PUBLISHED_NOW') {
        postDate = new Date(post.time);
      } else {
        return false;
      }
      return postDate.getFullYear() === date.getFullYear() &&
             postDate.getMonth() === date.getMonth() &&
             postDate.getDate() === date.getDate();
    });
  };

  // Click handler to register in that day
  const handleDayClick = (date: Date) => {
    const targetDate = new Date(date);
    const now = new Date();
    
    targetDate.setHours(now.getHours());
    targetDate.setMinutes(now.getMinutes());
    
    const pad = (num: number) => String(num).padStart(2, '0');
    const formattedDateTime = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}T${pad(targetDate.getHours())}:${pad(targetDate.getMinutes())}`;
    
    setScheduledTime(formattedDateTime);
    setSuccess(`TARGET_DATE_CALIBRATED_TO: ${targetDate.toLocaleDateString()} at ${pad(targetDate.getHours())}:${pad(targetDate.getMinutes())}`);
    setShowComposer(true);
    
    setTimeout(() => {
      const composerCard = document.getElementById('post-composer-card');
      if (composerCard) {
        composerCard.scrollIntoView({ behavior: 'smooth' });
      }
      if (composerRef.current) {
        composerRef.current.focus();
      }
    }, 150);
  };

  const getPriorityColor = (p?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') => {
    switch (p) {
      case 'LOW': return 'bg-neo-muted text-neo-black';
      case 'MEDIUM': return 'bg-blue-200 text-blue-900 border-blue-400';
      case 'HIGH': return 'bg-orange-200 text-orange-950 border-orange-400';
      case 'CRITICAL': return 'bg-red-200 text-red-950 border-red-400 animate-pulse';
      default: return 'bg-neo-bg text-neo-black';
    }
  };

  const getTaskStatus = (item: SchedulerHistoryEntry): 'PENDING' | 'DUE' | 'COMPLETE' | 'PUBLISHED' | 'SCHEDULED' => {
    if (item.type !== 'TASK' && item.type !== 'IMPLEMENTATION') {
      return item.status;
    }
    if (item.status === 'COMPLETE') return 'COMPLETE';
    const itemTime = new Date(item.time).getTime();
    const now = new Date().getTime();
    if (itemTime < now) {
      return 'DUE';
    }
    return 'PENDING';
  };

  // Tactical Timeline History Utility Functions
  const filterAndSortHistory = () => {
    let filtered = scheduledPosts.filter(post => {
      // Type filter
      if (filterType === 'POST' && (post.type && post.type !== 'POST')) return false;
      if (filterType === 'TASK' && post.type !== 'TASK') return false;
      if (filterType === 'IMPLEMENTATION' && post.type !== 'IMPLEMENTATION') return false;

      // Priority filter
      if (priorityFilter !== 'ALL' && post.priority !== priorityFilter) return false;

      // Status filter
      if (statusFilter !== 'ALL' && getTaskStatus(post) !== statusFilter) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          post.text.toLowerCase().includes(query) ||
          (post.page && post.page.toLowerCase().includes(query)) ||
          (post.implementationFile && post.implementationFile.toLowerCase().includes(query)) ||
          (post.type && post.type.toLowerCase().includes(query))
        );
      }

      // Tag filter
      if (tagFilter && tagFilter.trim()) {
        if (!post.tags || !post.tags.includes(tagFilter)) return false;
      }

      return true;
    });

    // Sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      // Handle undefined values
      if (aVal === undefined) aVal = '';
      if (bVal === undefined) bVal = '';

      // Convert time strings to numbers for proper sorting
      if (sortField === 'time') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      // Numeric comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });

    return sorted;
  };

  const filteredAndSorted = filterAndSortHistory();
  const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
  const paginatedData = filteredAndSorted.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handle sorting column click
  const handleSortClick = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, priorityFilter, statusFilter, searchQuery]);

  const SortableHeader = ({ field, label }: { field: typeof sortField; label: string }) => (
    <th 
      className="p-4 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-neo-black/10 transition-colors"
      onClick={() => handleSortClick(field)}
      title={`Click to sort by ${label}`}
    >
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span>{label}</span>
        {sortField === field && (
          <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative flex flex-col">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      {/* Print Stylesheet */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          aside, nav, header, .print-hidden, #chatbot-fab, .chatbot-window, button, .alert {
            display: none !important;
          }
          
          #main-content, main, .min-h-full, #root, body, html {
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #FFFFFF !important;
          }
          
          .print-only-container {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #FFFFFF !important;
          }
          
          @page {
            size: A4 landscape;
            margin: 10mm 12mm;
          }
        }
      `}} />

      {/* Standard Header - Print Hidden */}
      <header className="relative z-10 mb-8 max-w-[1200px] w-full mx-auto print-hidden">
        <div className="inline-block bg-neo-secondary text-neo-black px-2 py-0.5 mb-2 neo-border-sm rotate-1">
          <span className="text-[10px] font-black uppercase tracking-widest">TACTICAL_SCHEDULER_CORE</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-neo-black leading-none">
          TACTICAL_<span className="text-neo-accent outline-text">SCHEDULER</span>
        </h1>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-[1200px] w-full mx-auto flex-1">
        {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-6 print-hidden" />}
        {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} className="mb-6 print-hidden" />}

        <div className="space-y-12">
          {!showComposer ? (
            <>
              {/* Orchestrator Filters Row */}
              <div className="flex flex-wrap items-center gap-3 bg-white p-3 border-4 border-neo-black neo-shadow-sm print-hidden">
                <span className="text-[10px] font-black uppercase tracking-widest text-neo-black/60 mr-2">Orchestration filter:</span>
                <button
                  type="button"
                  onClick={() => setFilterType('ALL')}
                  className={`px-3 py-1.5 border-2 border-neo-black font-black text-[10px] uppercase transition-all duration-100 ${filterType === 'ALL' ? 'bg-neo-secondary translate-x-[2px] translate-y-[2px] neo-shadow-sm' : 'bg-white hover:bg-neo-bg'}`}
                >
                  <i className="fas fa-list mr-1"></i> Show All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('POST')}
                  className={`px-3 py-1.5 border-2 border-neo-black font-black text-[10px] uppercase transition-all duration-100 ${filterType === 'POST' ? 'bg-blue-400 text-white translate-x-[2px] translate-y-[2px] neo-shadow-sm' : 'bg-white hover:bg-neo-bg'}`}
                >
                  <i className="fas fa-bullhorn mr-1"></i> Social Posts
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('TASK')}
                  className={`px-3 py-1.5 border-2 border-neo-black font-black text-[10px] uppercase transition-all duration-100 ${filterType === 'TASK' ? 'bg-green-500 text-white translate-x-[2px] translate-y-[2px] neo-shadow-sm' : 'bg-white hover:bg-neo-bg'}`}
                >
                  <i className="fas fa-check-square mr-1"></i> Tactical Tasks
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('IMPLEMENTATION')}
                  className={`px-3 py-1.5 border-2 border-neo-black font-black text-[10px] uppercase transition-all duration-100 ${filterType === 'IMPLEMENTATION' ? 'bg-neo-accent text-white translate-x-[2px] translate-y-[2px] neo-shadow-sm' : 'bg-white hover:bg-neo-bg'}`}
                >
                  <i className="fas fa-scroll mr-1"></i> Plan Implementations
                </button>
              </div>

              {/* Premium Neo-Brutalist Calendar View - Print Hidden */}
              <div className="print-hidden animate-fade-in">
                <Card title="TIMELINE_COORDINATOR" className="bg-white neo-shadow-lg">
                  <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 mb-6">
                    <div className="flex items-center gap-2">
                      <button 
                        type="button"
                        onClick={prevMonth}
                        className="h-[46px] w-[46px] flex items-center justify-center bg-white hover:bg-neo-bg neo-border neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-100"
                        title="PREVIOUS_MONTH"
                      >
                        <i className="fas fa-chevron-left text-neo-black text-sm"></i>
                      </button>
                      
                      <div className="relative">
                        <select
                          id="monthSelect"
                          value={String(selectedMonth)}
                          onChange={(e) => setSelectedMonth(Number(e.target.value))}
                          className="appearance-none h-[46px] w-44 px-4 pr-10 bg-white neo-border font-black text-neo-black text-xs uppercase tracking-wider cursor-pointer focus:outline-none focus:bg-neo-secondary transition-colors duration-100"
                        >
                          {monthsList.map((name, index) => (
                            <option key={index} value={String(index)}>{name}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-neo-black">
                          <i className="fas fa-chevron-down text-xs"></i>
                        </div>
                      </div>

                      <div className="relative">
                        <select
                          id="yearSelect"
                          value={String(selectedYear)}
                          onChange={(e) => setSelectedYear(Number(e.target.value))}
                          className="appearance-none h-[46px] w-28 px-4 pr-10 bg-white neo-border font-black text-neo-black text-xs uppercase tracking-wider cursor-pointer focus:outline-none focus:bg-neo-secondary transition-colors duration-100"
                        >
                          {[2025, 2026, 2027, 2028, 2029, 2030].map(yr => (
                            <option key={yr} value={String(yr)}>{yr}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-neo-black">
                          <i className="fas fa-chevron-down text-xs"></i>
                        </div>
                      </div>

                      <button 
                        type="button"
                        onClick={nextMonth}
                        className="h-[46px] w-[46px] flex items-center justify-center bg-white hover:bg-neo-bg neo-border neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-100"
                        title="NEXT_MONTH"
                      >
                        <i className="fas fa-chevron-right text-neo-black text-sm"></i>
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        onClick={() => setShowComposer(true)}
                        className="bg-neo-accent text-white flex items-center gap-2 h-[46px] neo-border-sm font-black uppercase"
                      >
                        <i className="fas fa-plus"></i> New Orchestration
                      </Button>
                      <Button 
                        onClick={() => setIsPrintModalOpen(true)}
                        className="bg-neo-secondary text-neo-black flex items-center gap-2 h-[46px] neo-border-sm font-black"
                      >
                        <i className="fas fa-file-pdf"></i> EXPORT_PDF
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-2 border-4 border-neo-black p-2 bg-neo-bg overflow-x-auto min-w-[700px]">
                    {/* Weekdays */}
                    {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                      <div key={day} className="bg-neo-black text-white text-xs font-black py-3 text-center border-2 border-neo-black">
                        {day}
                      </div>
                    ))}
                    
                    {/* Calendar Days */}
                    {getDaysInMonth(selectedYear, selectedMonth).map((day, index) => {
                      const datePosts = getPostsForDate(day.date);
                      return (
                        <div 
                          key={index} 
                          onClick={() => handleDayClick(day.date)}
                          className={`
                            min-h-[130px] p-3 neo-border-sm bg-white flex flex-col justify-between transition-all duration-150 relative cursor-pointer group
                            ${day.isCurrentMonth ? 'text-neo-black' : 'bg-neo-bg/40 opacity-40 hover:opacity-80'}
                            ${day.isToday ? 'bg-neo-secondary/30 ring-4 ring-neo-accent ring-inset' : 'hover:-translate-y-1 hover:neo-shadow-sm'}
                          `}
                        >
                          <div className="flex justify-between items-start">
                            <span className={`text-base font-black ${day.isToday ? 'text-neo-accent' : ''}`}>
                              {day.date.getDate()}
                            </span>
                            {day.isToday && (
                              <span className="bg-neo-accent text-white text-[8px] font-black px-1.5 py-0.5 neo-border-sm rotate-3">
                                TODAY
                              </span>
                            )}
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-neo-accent font-black">
                              <i className="fas fa-plus-circle"></i>
                            </span>
                          </div>

                          {/* Scheduled Tasks List inside cell */}
                          <div className="mt-2 space-y-1.5 flex-1 overflow-y-auto max-h-[80px] scrollbar-thin">
                            {datePosts.map(post => {
                              const isTask = post.type === 'TASK';
                              const isImp = post.type === 'IMPLEMENTATION';
                              const effectiveStatus = getTaskStatus(post);
                              const isDone = effectiveStatus === 'COMPLETE' || post.status === 'PUBLISHED';
                              let badgeColor = 'bg-blue-400 text-white';
                              let icon = 'fa-bullhorn';
                              if (isTask) {
                                if (effectiveStatus === 'COMPLETE') {
                                  badgeColor = 'bg-gray-400 text-gray-100 opacity-60';
                                  icon = 'fa-check-double';
                                } else if (effectiveStatus === 'DUE') {
                                  badgeColor = 'bg-red-500 text-white animate-pulse-subtle';
                                  icon = 'fa-exclamation-triangle';
                                } else {
                                  badgeColor = 'bg-green-500 text-white';
                                  icon = 'fa-check-square';
                                }
                              } else if (isImp) {
                                if (effectiveStatus === 'COMPLETE') {
                                  badgeColor = 'bg-gray-400 text-gray-100 opacity-60';
                                  icon = 'fa-check-double';
                                } else if (effectiveStatus === 'DUE') {
                                  badgeColor = 'bg-red-500 text-white animate-pulse-subtle';
                                  icon = 'fa-exclamation-triangle';
                                } else {
                                  badgeColor = 'bg-neo-accent text-white';
                                  icon = 'fa-scroll';
                                }
                              } else {
                                // POST type
                                if (post.status === 'PUBLISHED') {
                                  badgeColor = 'bg-gray-300 text-gray-500 opacity-60';
                                  icon = 'fa-check';
                                }
                              }

                              return (
                                <div 
                                  key={post.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedSchedulerItem(post);
                                  }}
                                  className={`
                                    text-[9px] leading-tight p-1.5 border border-neo-black font-black truncate relative hover:translate-y-[-1px] transition-transform duration-100
                                    ${badgeColor}
                                  `}
                                  title={`${post.type || 'POST'}: ${post.text}`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1 truncate">
                                      <i className={`fas ${icon} text-[7px]`}></i>
                                      <span className={`truncate ${isDone ? 'line-through' : ''}`}>{post.text}</span>
                                    </div>
                                    {post.completionPercentage !== undefined && (
                                      <span className="text-[7px] bg-neo-black text-white px-0.5 border border-white">
                                        {post.completionPercentage}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>

              {/* Transmission History - Print Hidden */}
              <div className="print-hidden">
                <Card title="TACTICAL_TIMELINE_HISTORY" className="bg-white neo-shadow-md overflow-hidden">
                  {/* Filtering Controls */}
                  {!isLoadingHistory && (
                    <div className="p-4 border-b-2 border-neo-black space-y-4 bg-neo-bg">
                      {/* Search and Primary Filters */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                        {/* Search Box */}
                        <div className="lg:col-span-2">
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Search</label>
                          <Input
                            type="text"
                            placeholder="Search by description, page, or file..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full !text-xs"
                          />
                        </div>

                        {/* Type Filter */}
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Type</label>
                          <Select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value as any)}
                            options={[
                              { value: 'ALL', label: 'All Types' },
                              { value: 'POST', label: 'Posts' },
                              { value: 'TASK', label: 'Tasks' },
                              { value: 'IMPLEMENTATION', label: 'Implementation' },
                            ]}
                            className="!text-xs"
                          />
                        </div>

                        {/* Priority Filter */}
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Priority</label>
                          <Select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value as any)}
                            options={[
                              { value: 'ALL', label: 'All Priorities' },
                              { value: 'LOW', label: 'Low' },
                              { value: 'MEDIUM', label: 'Medium' },
                              { value: 'HIGH', label: 'High' },
                              { value: 'CRITICAL', label: 'Critical' },
                            ]}
                            className="!text-xs"
                          />
                        </div>

                        {/* Status Filter */}
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Status</label>
                          <Select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            options={[
                              { value: 'ALL', label: 'All Status' },
                              { value: 'PUBLISHED', label: 'Published' },
                              { value: 'SCHEDULED', label: 'Scheduled' },
                              { value: 'PENDING', label: 'Pending' },
                              { value: 'DUE', label: 'Due' },
                              { value: 'COMPLETE', label: 'Complete' },
                            ]}
                            className="!text-xs"
                          />
                        </div>

                        {/* Tag Filter */}
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Tag</label>
                          <Select
                            value={tagFilter}
                            onChange={(e) => setTagFilter(e.target.value)}
                            options={[
                              { value: '', label: 'All Tags' },
                              ...Array.from(new Set(scheduledPosts.flatMap(p => p.tags || []))).map(t => ({ value: t, label: t }))
                            ]}
                            className="!text-xs"
                          />
                        </div>
                      </div>

                      {/* Results Info and Items Per Page */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[9px] font-black opacity-70">
                          Showing {paginatedData.length > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredAndSorted.length)} of {filteredAndSorted.length} items
                        </span>
                        <div className="flex items-center gap-2">
                          <label className="text-[9px] font-black opacity-70 whitespace-nowrap">Items per page:</label>
                          <Select
                            value={itemsPerPage.toString()}
                            onChange={(e) => {
                              setItemsPerPage(parseInt(e.target.value));
                              setCurrentPage(1);
                            }}
                            options={[
                              { value: '5', label: '5' },
                              { value: '10', label: '10' },
                              { value: '25', label: '25' },
                              { value: '50', label: '50' },
                            ]}
                            className="!text-xs w-20"
                          />
                        </div>
                      </div>

                      {/* Auto-Update Controls and Sync Status */}
                      <div className="border-t-2 border-neo-black pt-4 space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-3">
                            {/* Auto-Update Toggle */}
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={autoUpdateEnabled}
                                onChange={(e) => setAutoUpdateEnabled(e.target.checked)}
                                className="w-4 h-4 border-2 border-neo-black"
                              />
                              <span className="text-[9px] font-black uppercase tracking-widest">
                                AUTO-SYNC FROM MCP
                              </span>
                            </label>

                            {/* Sync Status Indicator */}
                            <div className={`flex items-center gap-1.5 px-2 py-1 border-2 border-neo-black text-[8px] font-black uppercase ${
                              syncIndicator === 'syncing' ? 'bg-blue-300 text-blue-900 animate-pulse' :
                              syncIndicator === 'updated' ? 'bg-green-300 text-green-900' :
                              syncIndicator === 'error' ? 'bg-red-300 text-red-900' :
                              'bg-neo-muted text-neo-black'
                            }`}>
                              <i className={`fas ${
                                syncIndicator === 'syncing' ? 'fa-spinner fa-spin' :
                                syncIndicator === 'updated' ? 'fa-check-circle' :
                                syncIndicator === 'error' ? 'fa-exclamation-circle' :
                                'fa-cloud'
                              }`}></i>
                              <span>{
                                syncIndicator === 'syncing' ? 'SYNCING...' :
                                syncIndicator === 'updated' ? 'SYNCED' :
                                syncIndicator === 'error' ? 'SYNC ERROR' :
                                'READY'
                              }</span>
                            </div>

                            {/* Update Count Badge */}
                            {updateCount > 0 && (
                              <div className="px-2 py-1 bg-neo-accent text-white border-2 border-neo-black text-[8px] font-black">
                                {updateCount} SYNCS
                              </div>
                            )}
                          </div>

                          {/* Last Sync Time */}
                          <div className="flex items-center gap-2">
                            <i className="fas fa-sync-alt text-xs opacity-50"></i>
                            <span className="text-[9px] font-black opacity-70">
                              {lastMCPSync ? `Last sync: ${getFormattedLastUpdated()}` : 'Never synced'}
                            </span>
                          </div>
                        </div>

                        {/* Auto-Update Interval Selector */}
                        {autoUpdateEnabled && (
                          <div className="flex items-center gap-2">
                            <label className="text-[9px] font-black uppercase tracking-widest opacity-70">Sync Interval:</label>
                            <Select
                              value={autoUpdateInterval.toString()}
                              onChange={(e) => {
                                const newInterval = parseInt(e.target.value);
                                setAutoUpdateInterval(newInterval);
                              }}
                              options={[
                                { value: '3000', label: 'Every 3s' },
                                { value: '5000', label: 'Every 5s' },
                                { value: '10000', label: 'Every 10s' },
                                { value: '30000', label: 'Every 30s' },
                                { value: '60000', label: 'Every 1m' },
                              ]}
                              className="!text-xs w-40"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                   {isLoadingHistory ? (
                     <div className="p-20 flex justify-center">
                       <LoadingSpinner size="md" />
                     </div>
                   ) : (
                     <div className="overflow-x-auto">
                       <table className="w-full text-left font-space border-collapse">
                         <thead>
                           <tr className="bg-neo-muted border-b-2 border-neo-black">
                             <SortableHeader field="type" label="Type" />
                             <SortableHeader field="text" label="Payload description" />
                             <SortableHeader field="priority" label="Priority" />
                             <SortableHeader field="page" label="Target Node / Linked Plan" />
                             <SortableHeader field="time" label="Scheduled date" />
                             <th className="p-4 text-[10px] font-black uppercase tracking-widest">Progress</th>
                             <th className="p-4 text-[10px] font-black uppercase tracking-widest">Actions</th>
                           </tr>
                         </thead>
                         <tbody>
                           {paginatedData
                            .map(post => {
                             const isTask = post.type === 'TASK';
                             const isImp = post.type === 'IMPLEMENTATION';
                             const rowStatus = getTaskStatus(post);
                             const isRowDone = rowStatus === 'COMPLETE' || post.status === 'PUBLISHED';
                             return (
                               <tr key={post.id} className={`border-b border-neo-black/10 hover:bg-neo-bg transition-colors ${isRowDone ? 'opacity-50 bg-gray-50' : ''}`}>
                                 <td className="p-4">
                                   <span className={`px-2 py-0.5 neo-border-sm text-[8px] font-black uppercase ${
                                     isRowDone
                                       ? 'bg-gray-300 text-gray-500 border-gray-400'
                                       : post.type === 'TASK'
                                         ? 'bg-green-500 text-white'
                                         : post.type === 'IMPLEMENTATION'
                                           ? 'bg-neo-accent text-white'
                                           : 'bg-blue-400 text-white'
                                   }`}>
                                     {isRowDone && <i className="fas fa-check mr-1"></i>}
                                     {post.type || 'POST'}
                                   </span>
                                 </td>
                                 <td className="p-4 text-xs font-bold truncate max-w-xs">
                                   <span className={isRowDone ? 'line-through text-gray-400' : ''}>{post.text}</span>
                                 </td>
                                 <td className="p-4">
                                   {post.priority ? (
                                     <span className={`px-2 py-0.5 text-[8px] border-2 border-neo-black font-black uppercase ${isRowDone ? 'bg-gray-200 text-gray-400 border-gray-300' : getPriorityColor(post.priority)}`}>
                                       {post.priority}
                                     </span>
                                   ) : (
                                     <span className="opacity-20 font-black text-[9px]">-</span>
                                   )}
                                 </td>
                                 <td className="p-4 text-[10px] font-black uppercase">
                                   {isImp ? (
                                     <span className={`${isRowDone ? 'text-gray-400 line-through' : 'text-neo-accent'} underline truncate max-w-[150px] inline-block`} title={post.implementationFile}>
                                       📄 {post.implementationFile?.split('/').pop()}
                                     </span>
                                   ) : (
                                     <span className={isRowDone ? 'text-gray-400' : ''}>{post.page || 'SYSTEM CORE'}</span>
                                   )}
                                 </td>
                                 <td className="p-4 text-[10px] font-bold opacity-60">
                                   {new Date(post.time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                 </td>
                                 <td className="p-4">
                                   {post.completionPercentage !== undefined ? (
                                     <div className="flex flex-col gap-1.5">
                                       <div className="flex items-center gap-2">
                                         <div className="w-16 bg-gray-200 h-2.5 border border-neo-black relative overflow-hidden">
                                           <div className={`h-full ${isRowDone ? 'bg-gray-400' : 'bg-green-500'}`} style={{ width: `${post.completionPercentage}%` }}></div>
                                         </div>
                                         <span className="text-[9px] font-black">{post.completionPercentage}%</span>
                                       </div>
                                       <div>
                                         <span className={`px-1.5 py-0.5 border border-neo-black text-[8px] font-black uppercase ${
                                           rowStatus === 'COMPLETE' ? 'bg-gray-200 text-gray-500 border-gray-400' :
                                           rowStatus === 'DUE' ? 'bg-red-200 text-red-950 border-red-400 animate-pulse' :
                                           'bg-yellow-200 text-yellow-950 border-yellow-400'
                                         }`}>
                                           {rowStatus}
                                         </span>
                                       </div>
                                     </div>
                                   ) : (
                                     <span className={`px-1.5 py-0.5 border border-neo-black text-[8px] font-black uppercase ${
                                       post.status === 'PUBLISHED'
                                         ? 'bg-gray-200 text-gray-500 border-gray-400'
                                         : 'bg-neo-accent text-white'
                                     }`}>
                                       {post.status}
                                     </span>
                                   )}
                                 </td>
                                 <td className="p-4">
                                   <div className="flex gap-2">
                                     <Button
                                       size="sm"
                                       variant="primary"
                                       className="!p-1 h-[26px] w-[26px] flex items-center justify-center border-2 border-neo-black"
                                       onClick={() => setSelectedSchedulerItem(post)}
                                       title="Manage Checkpoints"
                                     >
                                       <i className="fas fa-tasks text-xs"></i>
                                     </Button>
                                     <Button
                                       size="sm"
                                       className="bg-red-400 text-neo-black hover:bg-neo-accent hover:text-white !p-1 h-[26px] w-[26px] flex items-center justify-center border-2 border-neo-black"
                                       onClick={() => handleDeleteOrchestration(post.id)}
                                       title="Delete Orchestration"
                                     >
                                       <i className="fas fa-trash text-xs"></i>
                                     </Button>
                                   </div>
                                 </td>
                               </tr>
                             );
                           })}
                           {paginatedData.length === 0 && (
                             <tr>
                               <td colSpan={7} className="p-20 text-center opacity-20 font-black uppercase text-xs tracking-widest">
                                 {filteredAndSorted.length === 0 ? 'NO_ORCHESTRATED_HISTORY_AVAILABLE' : 'NO_RESULTS_MATCHING_FILTERS'}
                               </td>
                             </tr>
                           )}
                         </tbody>
                       </table>
                     </div>
                   )}

                  {/* Pagination Controls */}
                  {!isLoadingHistory && filteredAndSorted.length > 0 && (
                    <div className="p-4 border-t-2 border-neo-black bg-neo-bg flex items-center justify-center gap-3 flex-wrap">
                      <Button
                        size="sm"
                        variant="primary"
                        className="!p-2 border-2 border-neo-black !px-4"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        title="First page"
                      >
                        <i className="fas fa-chevron-left"></i>
                        <i className="fas fa-chevron-left ml-2"></i>
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        className="!p-2 border-2 border-neo-black !px-4"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        title="Previous page"
                      >
                        <i className="fas fa-chevron-left"></i>
                      </Button>

                      <div className="flex items-center gap-2 px-4">
                        <span className="text-[9px] font-black whitespace-nowrap">Page</span>
                        <Input
                          type="number"
                          min="1"
                          max={totalPages}
                          value={currentPage}
                          onChange={(e) => {
                            const page = parseInt(e.target.value);
                            if (page >= 1 && page <= totalPages) {
                              setCurrentPage(page);
                            }
                          }}
                          className="!text-xs w-16 text-center"
                        />
                        <span className="text-[9px] font-black whitespace-nowrap">of {totalPages}</span>
                      </div>

                      <Button
                        size="sm"
                        variant="primary"
                        className="!p-2 border-2 border-neo-black !px-4"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        title="Next page"
                      >
                        <i className="fas fa-chevron-right"></i>
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        className="!p-2 border-2 border-neo-black !px-4"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        title="Last page"
                      >
                        <i className="fas fa-chevron-right"></i>
                        <i className="fas fa-chevron-right ml-2"></i>
                      </Button>
                    </div>
                  )}
                </Card>
              </div>
            </>
          ) : (
            /* --- UNIFIED COMPOSER FOR ORCHESTRATION --- */
            <div className="space-y-6 print-hidden animate-fade-in">
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="flex items-center gap-2 px-4 py-3 bg-white text-neo-black font-black uppercase tracking-wider text-xs neo-border neo-shadow-sm hover:bg-neo-bg active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-100"
              >
                <i className="fas fa-arrow-left"></i> BACK_TO_CALENDAR_VIEW
              </button>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <Card 
                    id="post-composer-card" 
                    title="ORCHESTRATION_COMPOSER" 
                    className="bg-white neo-shadow-lg h-full border-4 border-neo-black"
                  >
                    {/* Tabs row */}
                    <div className="grid grid-cols-3 gap-2 border-b-4 border-neo-black pb-4 mb-6">
                      <button
                        type="button"
                        onClick={() => setOrchestrationType('POST')}
                        className={`py-3 border-2 border-neo-black font-black text-xs uppercase text-center transition-all ${orchestrationType === 'POST' ? 'bg-blue-400 text-white translate-x-[2px] translate-y-[2px] neo-shadow-sm' : 'bg-neo-bg hover:bg-white'}`}
                      >
                        <i className="fas fa-bullhorn mr-1"></i> Social Post
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrchestrationType('TASK')}
                        className={`py-3 border-2 border-neo-black font-black text-xs uppercase text-center transition-all ${orchestrationType === 'TASK' ? 'bg-green-500 text-white translate-x-[2px] translate-y-[2px] neo-shadow-sm' : 'bg-neo-bg hover:bg-white'}`}
                      >
                        <i className="fas fa-check-square mr-1"></i> Tactical Task
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrchestrationType('IMPLEMENTATION')}
                        className={`py-3 border-2 border-neo-black font-black text-xs uppercase text-center transition-all ${orchestrationType === 'IMPLEMENTATION' ? 'bg-neo-accent text-white translate-x-[2px] translate-y-[2px] neo-shadow-sm' : 'bg-neo-bg hover:bg-white'}`}
                      >
                        <i className="fas fa-scroll mr-1"></i> Plan Implementation
                      </button>
                    </div>

                    <form onSubmit={handleScheduleOrchestration} className="space-y-6">
                      {/* Dynamic form inputs */}
                      {orchestrationType === 'POST' && (
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">TARGET_PAGE_NODE</label>
                          <Select
                            id="pageSelect"
                            value={selectedPage?.id || ''}
                            onChange={(e) => {
                              const page = fbPages.find(p => p.id === e.target.value);
                              setSelectedPage(page || null);
                            }}
                            options={fbPages.map(p => ({ value: p.id, label: p.name.toUpperCase() }))}
                            placeholder="SELECT_DESTINATION_PAGE"
                          />
                          {!isLoggedIn && (
                            <p className="mt-2 text-[10px] text-red-500 font-bold uppercase">
                              ⚠️ Facebook API is offline. Configure credentials in Settings to enable direct Meta feed posts.
                            </p>
                          )}
                        </div>
                      )}

                      {orchestrationType === 'IMPLEMENTATION' && (
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">SELECT_PLAN_MODULE_TO_IMPLEMENT</label>
                          <SearchableSelect
                            id="planSelect"
                            value={selectedFile}
                            onChange={(value) => setSelectedFile(value as string)}
                            options={planningFiles.map(f => ({ value: f.path, label: f.name.toUpperCase() }))}
                            placeholder="SELECT_PLAN_FILE"
                          />
                        </div>
                      )}

                      {orchestrationType !== 'POST' && (
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-3 opacity-60">PRIORITY_LEVEL</label>
                          <div className="grid grid-cols-4 gap-3">
                            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((level) => (
                              <button
                                key={level}
                                type="button"
                                onClick={() => setTaskPriority(level as any)}
                                className={`py-2 border-2 border-neo-black font-black text-[10px] uppercase text-center transition-all ${taskPriority === level ? 'bg-neo-secondary neo-shadow-sm translate-x-[2px] translate-y-[2px]' : 'bg-neo-bg hover:bg-white'}`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">
                          {orchestrationType === 'POST' ? 'POST_MESSAGE_PAYLOAD' : orchestrationType === 'TASK' ? 'TASK_DESCRIPTION' : 'IMPLEMENTATION_ACTION_SUMMARY'}
                        </label>
                        <textarea
                          ref={composerRef}
                          className="w-full h-36 p-4 neo-border bg-neo-bg font-space font-bold text-sm focus:outline-none focus:ring-2 focus:ring-neo-accent resize-none"
                          placeholder={orchestrationType === 'POST' ? 'ENTER_CONTENT_POST_DATA...' : 'DESCRIBE_TACTICAL_ACTION_POINTS...'}
                          value={postText}
                          onChange={(e) => setPostText(e.target.value)}
                          required
                        />
                      </div>

                      {/* Tags input */}
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">TAGS (optional)</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                            placeholder="Add tag and press Enter"
                            className="flex-1 px-3 py-2 neo-border bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-neo-accent"
                          />
                          <button
                            type="button"
                            onClick={handleAddTag}
                            className="px-3 py-2 bg-neo-black text-white font-black text-xs uppercase border-2 border-neo-black hover:bg-neo-accent"
                          >Add</button>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {tags.map(t => (
                            <span key={t} className="px-2 py-1 bg-neo-bg border border-neo-black text-xs font-black flex items-center gap-2">
                              <span className="uppercase">{t}</span>
                              <button type="button" onClick={() => handleRemoveTag(t)} className="text-red-500 hover:text-red-700">×</button>
                            </span>
                          ))}
                          {tags.length === 0 && (
                            <span className="text-[9px] font-black opacity-40">No tags added</span>
                          )}
                        </div>
                      </div>

                      {/* Milestones dynamic checkpoint stacking */}
                      {orchestrationType !== 'POST' && (
                        <div className="bg-neo-bg p-4 border-2 border-neo-black neo-shadow-sm">
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-3">MILESTONE_CHECKPOINTS</label>
                          
                          <div className="flex gap-2 mb-4">
                            <input
                              type="text"
                              value={newMilestoneText}
                              onChange={e => setNewMilestoneText(e.target.value)}
                              placeholder="E.g. Finalize invoice templates"
                              className="flex-1 px-3 py-2 neo-border bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-neo-accent"
                            />
                            <button
                              type="button"
                              onClick={handleAddMilestone}
                              className="px-4 bg-neo-black text-white font-black text-xs uppercase border-2 border-neo-black hover:bg-neo-accent"
                            >
                              Add Milestone
                            </button>
                          </div>

                          <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                            {milestones.map((m, idx) => (
                              <div key={idx} className="flex justify-between items-center bg-white p-2 border border-neo-black text-xs font-bold">
                                <span>🏁 {m.label}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMilestone(idx)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <i className="fas fa-times-circle"></i>
                                </button>
                              </div>
                            ))}
                            {milestones.length === 0 && (
                              <p className="text-[9px] font-black uppercase opacity-40 text-center py-4">No checkpoints added yet. Milestone tracking is optional.</p>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">SCHEDULE_TARGET_DATE_TIME</label>
                          <Input
                            type="datetime-local"
                            value={scheduledTime}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            className="!mb-0"
                            required
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="submit"
                            variant="primary"
                            className="w-full h-[46px] bg-neo-accent animate-pulse-subtle font-black uppercase"
                            isLoading={isLoading}
                            disabled={!postText.trim() || isLoading}
                          >
                            {orchestrationType === 'POST' ? 'Publish Content Node' : orchestrationType === 'TASK' ? 'Deploy Tactical Task' : 'Activate Plan Implementation'}
                          </Button>
                        </div>
                      </div>
                    </form>
                  </Card>
                </div>

                {/* Left composer widget cards */}
                <div className="space-y-8">
                  <Card title="PREVIEW_SIMULATION" className="bg-neo-muted neo-shadow-md border-4 border-neo-black">
                    <div className="p-4 bg-white neo-border-sm">
                       <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-neo-black flex items-center justify-center text-white">
                            <i className={`fas ${orchestrationType === 'POST' ? 'fa-bullhorn text-blue-300' : orchestrationType === 'TASK' ? 'fa-check-square text-green-300' : 'fa-scroll text-red-300'}`}></i>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-tight">
                              {orchestrationType === 'POST' ? (selectedPage?.name || 'STEADYSOCIAL FEED') : orchestrationType === 'TASK' ? 'TACTICAL ORCHESTRATION' : 'PLAN DEPLOYMENT'}
                            </p>
                            <p className="text-[8px] font-bold opacity-40 uppercase">STATUS: DRAFT</p>
                          </div>
                       </div>
                       
                       <p className="text-xs font-bold opacity-80 mb-4 whitespace-pre-wrap">
                          {postText || 'Payload message preview awaiting details...'}
                       </p>

                       {orchestrationType !== 'POST' && (
                         <div className="mb-4 p-2 border border-dashed border-neo-black text-[9px] font-black uppercase bg-neo-bg">
                           Priority: {taskPriority} | Checkpoints count: {milestones.length}
                         </div>
                       )}

                       {orchestrationType === 'IMPLEMENTATION' && selectedFile && (
                         <div className="mb-4 text-[9px] font-black text-neo-accent uppercase">
                           Target plan: {selectedFile.split('/').pop()}
                         </div>
                       )}

                       <div className="h-28 bg-neo-bg neo-border-sm flex items-center justify-center">
                          <i className="fas fa-network-wired text-3xl opacity-10"></i>
                       </div>
                    </div>
                  </Card>

                  <Card title="TACTICAL_REQUIREMENTS" className="bg-neo-black text-white">
                    <ul className="space-y-3 text-[10px] font-black uppercase tracking-widest">
                      <li className="flex items-center gap-2 text-green-400">
                        <i className="fas fa-check"></i> DB Sync Engine: Operational
                      </li>
                      <li className="flex items-center gap-2 text-green-400">
                        <i className="fas fa-check"></i> SQLite Connector: ONLINE
                      </li>
                      <li className="flex items-center gap-2 text-yellow-400">
                        <i className="fas fa-info-circle"></i> Tasks are saved locally.
                      </li>
                    </ul>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- SELECTED SCHEDULER ITEM DETAIL MODAL --- */}
      {selectedSchedulerItem && (
        <div className="fixed inset-0 bg-neo-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print-hidden font-space">
          <div className="bg-white neo-border border-4 border-neo-black neo-shadow-lg max-w-3xl w-full overflow-hidden animate-scale-up flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="bg-neo-black p-4 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-[8px] font-black uppercase ${selectedSchedulerItem.type === 'TASK' ? 'bg-green-500 text-white' : selectedSchedulerItem.type === 'IMPLEMENTATION' ? 'bg-neo-accent text-white' : 'bg-blue-400 text-white'}`}>
                  {selectedSchedulerItem.type || 'POST'}
                </span>
                <h3 className="text-sm font-black uppercase tracking-wider">MANAGEMENT_DRAWER</h3>
              </div>
              <button 
                onClick={() => setSelectedSchedulerItem(null)} 
                className="text-white hover:text-neo-accent text-2xl font-bold focus:outline-none"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* --- LEFT COLUMN: Text / Payload / Milestones --- */}
                <div className="space-y-5 flex flex-col">
                  {/* Edit Text (only in edit mode) */}
                  {isEditingSelected && selectedEditItem && (
                    <div className="p-4 bg-neo-bg border border-neo-black">
                      <label className="block text-[8px] font-black uppercase mb-1">Edit Text</label>
                      <textarea value={selectedEditItem.text} onChange={(e) => setSelectedEditItem({...selectedEditItem, text: e.target.value})} className="w-full p-2 neo-border min-h-[80px]" />
                    </div>
                  )}

                  {/* Payload summary */}
                  <div>
                    <span className="block text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">Payload summary</span>
                    {isEditingSelected && selectedEditItem ? (
                      <textarea value={selectedEditItem.text} onChange={(e) => setSelectedEditItem({...selectedEditItem, text: e.target.value})} className="w-full p-3 neo-border bg-neo-bg min-h-[100px]" />
                    ) : (
                      <p className="text-xs font-bold whitespace-pre-wrap bg-neo-bg p-3 border border-neo-black leading-relaxed">{selectedSchedulerItem.text}</p>
                    )}
                  </div>

                  {/* Milestones / Checkpoints */}
                  {selectedSchedulerItem.milestones && selectedSchedulerItem.milestones.length > 0 && (
                    <div className="flex-1">
                      <span className="block text-[8px] font-black uppercase tracking-widest opacity-40 mb-2">Milestone Checkpoints checklist</span>
                      
                      {/* Progress bar */}
                      <div className="flex items-center gap-2 mb-3 bg-neo-bg p-2 border border-neo-black">
                        <span className="text-[9px] font-black">PROGRESS:</span>
                        <div className="flex-1 bg-gray-200 h-3 border border-neo-black relative overflow-hidden">
                          <div className="bg-green-500 h-full transition-all duration-200" style={{ width: `${selectedSchedulerItem.completionPercentage || 0}%` }}></div>
                        </div>
                        <span className="text-[9px] font-black">{selectedSchedulerItem.completionPercentage || 0}%</span>
                      </div>

                      <div className="space-y-2 max-h-[200px] overflow-y-auto border border-neo-black bg-neo-bg/50 p-2">
                        {selectedSchedulerItem.milestones.map((milestone, idx) => (
                          <label key={idx} className="flex items-center gap-3 p-2 bg-white border border-neo-black cursor-pointer hover:bg-neo-bg transition-colors select-none text-xs font-bold">
                            <input
                              type="checkbox"
                              checked={milestone.completed}
                              onChange={() => handleToggleDetailMilestone(idx)}
                              className="h-4 w-4 rounded-none border-2 border-neo-black text-neo-accent focus:ring-0 focus:outline-none cursor-pointer"
                            />
                            <span className={milestone.completed ? 'line-through text-neo-black/40' : ''}>
                              {milestone.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* --- RIGHT COLUMN: Date, Priority, Status, Plan, Tags --- */}
                <div className="space-y-5">
                  {/* Creation Date / Time */}
                  <div>
                    <span className="block text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">Creation date / Time</span>
                    {isEditingSelected && selectedEditItem ? (
                      <input type="datetime-local" value={new Date(selectedEditItem.time).toISOString().slice(0,16)} onChange={(e) => setSelectedEditItem({...selectedEditItem, time: e.target.value})} className="p-2 neo-border w-full" />
                    ) : (
                      <p className="text-[11px] font-bold">📅 Scheduled for: {new Date(selectedSchedulerItem.time).toLocaleString()}</p>
                    )}
                  </div>

                  {/* Priority */}
                  {selectedSchedulerItem.priority && (
                    <div>
                      <span className="block text-[8px] font-black uppercase tracking-widest opacity-40 mb-1.5">Action priority</span>
                      {isEditingSelected && selectedEditItem ? (
                        <select value={selectedEditItem.priority || ''} onChange={(e) => setSelectedEditItem({...selectedEditItem, priority: e.target.value as any})} className="p-2 neo-border w-full">
                          <option value="">--</option>
                          <option value="LOW">LOW</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HIGH">HIGH</option>
                          <option value="CRITICAL">CRITICAL</option>
                        </select>
                      ) : (
                        <span className={`px-3 py-1 text-[9px] border-2 border-neo-black font-black uppercase ${getPriorityColor(selectedSchedulerItem.priority)}`}>{selectedSchedulerItem.priority}</span>
                      )}
                    </div>
                  )}

                  {/* Status Display and Quick Action Button */}
                  {(selectedSchedulerItem.type === 'TASK' || selectedSchedulerItem.type === 'IMPLEMENTATION') && (
                    <div>
                      <span className="block text-[8px] font-black uppercase tracking-widest opacity-40 mb-1.5">Task Status</span>
                      {isEditingSelected && selectedEditItem ? (
                        <select 
                          value={selectedEditItem.status || 'PENDING'} 
                          onChange={(e) => {
                            const newStatus = e.target.value as any;
                            let pct = selectedEditItem.completionPercentage;
                            let milestones = selectedEditItem.milestones;
                            if (newStatus === 'COMPLETE') {
                              pct = 100;
                              milestones = (selectedEditItem.milestones || []).map(m => ({ ...m, completed: true }));
                            } else if (newStatus === 'PENDING' && selectedEditItem.status === 'COMPLETE') {
                              pct = 0;
                              milestones = (selectedEditItem.milestones || []).map(m => ({ ...m, completed: false }));
                            }
                            setSelectedEditItem({
                              ...selectedEditItem,
                              status: newStatus,
                              completionPercentage: pct,
                              milestones,
                            });
                          }} 
                          className="p-2 neo-border w-full text-xs font-bold"
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="COMPLETE">COMPLETE</option>
                        </select>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 text-[9px] border-2 border-neo-black font-black uppercase ${
                            getTaskStatus(selectedSchedulerItem) === 'COMPLETE' ? 'bg-green-200 text-green-950 border-green-400' :
                            getTaskStatus(selectedSchedulerItem) === 'DUE' ? 'bg-red-200 text-red-950 border-red-400 animate-pulse' :
                            'bg-yellow-200 text-yellow-950 border-yellow-400'
                          }`}>
                            {getTaskStatus(selectedSchedulerItem)}
                          </span>
                          
                          {getTaskStatus(selectedSchedulerItem) !== 'COMPLETE' ? (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  setIsLoading(true);
                                  const updatedMilestones = (selectedSchedulerItem.milestones || []).map(m => ({ ...m, completed: true }));
                                  const updatedItem = {
                                    ...selectedSchedulerItem,
                                    milestones: updatedMilestones,
                                    completionPercentage: 100,
                                    status: 'COMPLETE' as const,
                                  };
                                  const saved = await dbUpdateSchedulerHistory(selectedSchedulerItem.id, updatedItem);
                                  setScheduledPosts(scheduledPosts.map(p => p.id === saved.id ? saved : p));
                                  setSelectedSchedulerItem(saved);
                                  setSuccess('TASK_MARKED_COMPLETE');
                                } catch (err: any) {
                                  setError(`UPDATE_FAILURE: ${err.message}`);
                                } finally {
                                  setIsLoading(false);
                                }
                              }}
                              className="px-3 py-1 bg-green-500 hover:bg-green-600 text-neo-black border-2 border-neo-black text-[9px] font-black uppercase transition-colors"
                            >
                              Mark Complete
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  setIsLoading(true);
                                  const updatedMilestones = (selectedSchedulerItem.milestones || []).map(m => ({ ...m, completed: false }));
                                  const updatedItem = {
                                    ...selectedSchedulerItem,
                                    milestones: updatedMilestones,
                                    completionPercentage: 0,
                                    status: 'PENDING' as const,
                                  };
                                  const saved = await dbUpdateSchedulerHistory(selectedSchedulerItem.id, updatedItem);
                                  setScheduledPosts(scheduledPosts.map(p => p.id === saved.id ? saved : p));
                                  setSelectedSchedulerItem(saved);
                                  setSuccess('TASK_MARKED_PENDING');
                                } catch (err: any) {
                                  setError(`UPDATE_FAILURE: ${err.message}`);
                                } finally {
                                  setIsLoading(false);
                                }
                              }}
                              className="px-3 py-1 bg-yellow-400 hover:bg-yellow-500 text-neo-black border-2 border-neo-black text-[9px] font-black uppercase transition-colors"
                            >
                              Mark Incomplete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Associated plan document */}
                  {selectedSchedulerItem.implementationFile && (
                    <div>
                      <span className="block text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">Associated plan document</span>
                      <p className="text-xs font-black text-neo-accent">
                        🔗 Linked Plan: <span className="underline">{selectedSchedulerItem.implementationFile.split('/').pop()}</span>
                      </p>
                    </div>
                  )}

                  {/* Tags */}
                  <div>
                    <span className="block text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">Tags</span>
                    {isEditingSelected && selectedEditItem ? (
                      <div>
                        <div className="flex gap-2 mb-2">
                          <input type="text" placeholder="Add tag" className="flex-1 p-2 neo-border" onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const v = (e.target as HTMLInputElement).value.trim();
                              if (!v) return;
                              const existing = selectedEditItem.tags || [];
                              if (!existing.includes(v)) setSelectedEditItem({...selectedEditItem, tags: [...existing, v]});
                              (e.target as HTMLInputElement).value = '';
                            }
                          }} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(selectedEditItem.tags || []).map(t => (
                            <span key={t} className="px-2 py-1 bg-neo-bg border border-neo-black text-xs font-black flex items-center gap-2">
                              <span className="uppercase">{t}</span>
                              <button type="button" onClick={() => setSelectedEditItem({...selectedEditItem, tags: (selectedEditItem.tags || []).filter(x => x !== t)})} className="text-red-500">×</button>
                            </span>
                          ))}
                          {(!selectedEditItem.tags || selectedEditItem.tags.length === 0) && <span className="text-[9px] opacity-40">No tags</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        {(selectedSchedulerItem.tags || []).map(t => <span key={t} className="px-2 py-1 bg-neo-bg border border-neo-black text-xs font-black uppercase">{t}</span>)}
                        {(!selectedSchedulerItem.tags || selectedSchedulerItem.tags.length === 0) && <span className="text-[9px] opacity-40">No tags</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* --- ACTION BUTTONS (full width below columns) --- */}
              <div className="flex gap-4 border-t-2 border-neo-black/10 pt-5 mt-6">
                {!isEditingSelected ? (
                  <>
                    <Button
                      onClick={() => {
                        setIsEditingSelected(true);
                        setSelectedEditItem(selectedSchedulerItem);
                      }}
                      className="flex-1 bg-neo-accent text-neo-black hover:bg-neo-black hover:text-white border-2 border-neo-black font-black uppercase py-3"
                    >
                      <i className="fas fa-edit mr-2"></i> Edit
                    </Button>
                    <Button
                      onClick={() => handleDeleteOrchestration(selectedSchedulerItem.id)}
                      className="flex-1 bg-red-400 text-neo-black hover:bg-neo-accent hover:text-white border-2 border-neo-black font-black uppercase py-3"
                      isLoading={isLoading}
                    >
                      <i className="fas fa-trash mr-2"></i> Delete
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setSelectedSchedulerItem(null)}
                      className="flex-1 border-2 border-neo-black font-black uppercase py-3"
                    >
                      Close
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={async () => {
                        if (!selectedEditItem) return;
                        try {
                          setIsLoading(true);
                          const updates: Partial<SchedulerHistoryEntry> = {
                            text: selectedEditItem.text,
                            time: selectedEditItem.time,
                            priority: selectedEditItem.priority,
                            milestones: selectedEditItem.milestones,
                            completionPercentage: selectedEditItem.completionPercentage,
                            implementationFile: selectedEditItem.implementationFile,
                            status: selectedEditItem.status,
                            tags: selectedEditItem.tags,
                          };
                          const saved = await dbUpdateSchedulerHistory(selectedEditItem.id, updates);
                          setScheduledPosts(prev => prev.map(p => p.id === saved.id ? saved : p));
                          setSelectedSchedulerItem(saved);
                          setSelectedEditItem(null);
                          setIsEditingSelected(false);
                          setSuccess('ORCHESTRATION_UPDATED');
                        } catch (err: any) {
                          setError(`UPDATE_FAILURE: ${err.message}`);
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                      className="flex-1 bg-green-500 text-neo-black hover:bg-green-700 border-2 border-neo-black font-black uppercase py-3"
                    >
                      Save Changes
                    </Button>
                    <Button
                      onClick={() => { setIsEditingSelected(false); setSelectedEditItem(null); }}
                      className="flex-1 border-2 border-neo-black font-black uppercase py-3"
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Config Modal - Screen Mode Only */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 bg-neo-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print-hidden font-space">
          <div className="bg-white neo-border border-4 border-neo-black neo-shadow-lg max-w-md w-full overflow-hidden animate-scale-up">
            <div className="bg-neo-accent border-b-4 border-neo-black p-4 flex justify-between items-center text-white">
              <h3 className="text-xl font-black uppercase tracking-tight">PDF_EXPORT_CALIBRATOR</h3>
              <button 
                onClick={() => setIsPrintModalOpen(false)} 
                className="text-white hover:text-neo-black text-2xl font-bold focus:outline-none"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-3 opacity-60">EXPORT_SCOPE</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    type="button"
                    onClick={() => setPrintType('month')}
                    className={`p-3 border-2 border-black font-black text-xs uppercase text-center transition-all ${printType === 'month' ? 'bg-neo-secondary neo-shadow-sm translate-x-[2px] translate-y-[2px]' : 'bg-white hover:bg-neo-bg'}`}
                  >
                    SELECTED_MONTH
                  </button>
                  <button 
                    type="button"
                    onClick={() => setPrintType('year')}
                    className={`p-3 border-2 border-black font-black text-xs uppercase text-center transition-all ${printType === 'year' ? 'bg-neo-secondary neo-shadow-sm translate-x-[2px] translate-y-[2px]' : 'bg-white hover:bg-neo-bg'}`}
                  >
                    WHOLE_YEAR
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-3 opacity-60">PRINT OPTIONS</label>
                <label className="flex items-center gap-3 p-3 bg-neo-bg border-2 border-black cursor-pointer hover:bg-white transition-colors select-none text-xs font-black uppercase">
                  <input
                    type="checkbox"
                    checked={printWithTasks}
                    onChange={(e) => setPrintWithTasks(e.target.checked)}
                    className="h-4 w-4 rounded-none border-2 border-black text-neo-accent focus:ring-0 focus:outline-none cursor-pointer"
                  />
                  <span>Print With Content</span>
                </label>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-3 opacity-60">CUSTOM COLOR LEGEND</label>
                <div className="space-y-3 bg-neo-bg p-3 border-2 border-black">
                  {/* Post Config */}
                  <div className="flex gap-2 items-center">
                    <input 
                      type="color" 
                      value={printPostColor} 
                      onChange={(e) => setPrintPostColor(e.target.value)} 
                      className="w-8 h-8 border border-black cursor-pointer bg-transparent"
                    />
                    <input 
                      type="text" 
                      value={printPostLabel} 
                      onChange={(e) => setPrintPostLabel(e.target.value)} 
                      placeholder="Post Label"
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-black font-black uppercase"
                    />
                  </div>
                  {/* Task Config */}
                  <div className="flex gap-2 items-center">
                    <input 
                      type="color" 
                      value={printTaskColor} 
                      onChange={(e) => setPrintTaskColor(e.target.value)} 
                      className="w-8 h-8 border border-black cursor-pointer bg-transparent"
                    />
                    <input 
                      type="text" 
                      value={printTaskLabel} 
                      onChange={(e) => setPrintTaskLabel(e.target.value)} 
                      placeholder="Task Label"
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-black font-black uppercase"
                    />
                  </div>
                  {/* Plan Config */}
                  <div className="flex gap-2 items-center">
                    <input 
                      type="color" 
                      value={printPlanColor} 
                      onChange={(e) => setPrintPlanColor(e.target.value)} 
                      className="w-8 h-8 border border-black cursor-pointer bg-transparent"
                    />
                    <input 
                      type="text" 
                      value={printPlanLabel} 
                      onChange={(e) => setPrintPlanLabel(e.target.value)} 
                      placeholder="Plan Label"
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-black font-black uppercase"
                    />
                  </div>
                  {/* Custom Legends list */}
                  {customLegends.map((legend) => (
                    <div key={legend.id} className="flex gap-2 items-center">
                      <input 
                        type="color" 
                        value={legend.color} 
                        onChange={(e) => handleUpdateCustomLegend(legend.id, { color: e.target.value })} 
                        className="w-8 h-8 border border-black cursor-pointer bg-transparent"
                      />
                      <input 
                        type="text" 
                        value={legend.label} 
                        onChange={(e) => handleUpdateCustomLegend(legend.id, { label: e.target.value })} 
                        placeholder="Tag / Match Word"
                        className="flex-1 min-w-0 px-2 py-1 text-xs border border-black font-black uppercase"
                      />
                      <button 
                        type="button"
                        onClick={() => handleRemoveCustomLegend(legend.id)}
                        className="w-8 h-8 bg-red-200 border border-black flex items-center justify-center font-black text-xs hover:bg-red-300"
                        title="Remove Legend"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddCustomLegend}
                    className="w-full py-1.5 border border-dashed border-black hover:bg-black/5 font-black text-[10px] uppercase flex items-center justify-center gap-1.5 transition-colors"
                  >
                    + Add Legend Item
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                <Button 
                  onClick={handleDownloadPDF} 
                  variant="primary" 
                  className="flex-grow bg-neo-accent text-white border-2 border-neo-black font-black uppercase py-3"
                  isLoading={isLoading}
                >
                  <i className="fas fa-file-pdf mr-2"></i> Download Exported PDF
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={() => setIsPrintModalOpen(false)}
                  className="border-2 border-neo-black font-black uppercase py-3"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- INVISIBLE PRINTABLE SHEETS CONTAINER --- */}
      <div className="print-only-container hidden">
        {printType === 'year' ? (
          /* Whole Year Print */
          <div className="space-y-16">
            {monthsList.map((mName, mIdx) => (
              <div key={mIdx} className="print-month-page p-8 bg-[#FFFDF5] border-4 border-black space-y-6 page-break-after">
                <div className="flex justify-between items-center border-b-4 border-black pb-4">
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-wider">{mName} {selectedYear}</h2>
                    <div className="flex flex-wrap gap-4 text-[11px] font-black uppercase mt-3">
                      <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 inline-block border-2 border-black" style={{ backgroundColor: printPostColor }}></span> {printPostLabel}</span>
                      <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 inline-block border-2 border-black" style={{ backgroundColor: printTaskColor }}></span> {printTaskLabel}</span>
                      <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 inline-block border-2 border-black" style={{ backgroundColor: printPlanColor }}></span> {printPlanLabel}</span>
                      {customLegends.map(legend => legend.label.trim() && (
                        <span key={legend.id} className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 inline-block border-2 border-black" style={{ backgroundColor: legend.color }}></span> {legend.label}</span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase text-right">SteadySocial Scheduler<br/>command sheet</span>
                </div>
                <div className="grid grid-cols-7 gap-2 border-4 border-black p-2 bg-[#FFFDF5]">
                  {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(dName => (
                    <div key={dName} className="bg-black text-white text-[10px] font-black py-2 text-center border">{dName}</div>
                  ))}
                  {getDaysInMonth(selectedYear, mIdx).map((cell, cIdx) => {
                    const cPosts = getPostsForDate(cell.date);
                    return (
                      <div key={cIdx} className={`min-h-[100px] p-2 border border-black flex flex-col justify-between ${cell.isCurrentMonth ? 'bg-white' : 'bg-gray-100 opacity-30'}`}>
                        <span className="text-xs font-black">{cell.date.getDate()}</span>
                        <div className="space-y-1 mt-1">
                          {printWithTasks && cPosts.map(p => {
                            const pColor = getPrintPostColor(p);
                            return (
                              <div key={p.id} className="text-[8px] p-1 border border-black font-black truncate" style={{ backgroundColor: pColor }}>
                                🏁 {p.text}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Single Month Print */
          <div className="p-8 bg-[#FFFDF5] border-4 border-black space-y-6">
            <div className="flex justify-between items-center border-b-4 border-black pb-4">
              <div>
                <h2 className="text-3xl font-black uppercase tracking-wider">{monthsList[selectedMonth]} {selectedYear}</h2>
                <div className="flex flex-wrap gap-4 text-[11px] font-black uppercase mt-3">
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 inline-block border-2 border-black" style={{ backgroundColor: printPostColor }}></span> {printPostLabel}</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 inline-block border-2 border-black" style={{ backgroundColor: printTaskColor }}></span> {printTaskLabel}</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 inline-block border-2 border-black" style={{ backgroundColor: printPlanColor }}></span> {printPlanLabel}</span>
                  {customLegends.map(legend => legend.label.trim() && (
                    <span key={legend.id} className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 inline-block border-2 border-black" style={{ backgroundColor: legend.color }}></span> {legend.label}</span>
                  ))}
                </div>
              </div>
              <span className="text-[10px] font-black uppercase text-right">SteadySocial Command sheet</span>
            </div>
            <div className="grid grid-cols-7 gap-2 border-4 border-black p-2 bg-[#FFFDF5]">
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(dName => (
                <div key={dName} className="bg-black text-white text-[10px] font-black py-2 text-center border">{dName}</div>
              ))}
              {getDaysInMonth(selectedYear, selectedMonth).map((cell, cIdx) => {
                const cPosts = getPostsForDate(cell.date);
                return (
                  <div key={cIdx} className={`min-h-[100px] p-2 border border-black flex flex-col justify-between ${cell.isCurrentMonth ? 'bg-white' : 'bg-gray-100 opacity-30'}`}>
                    <span className="text-xs font-black">{cell.date.getDate()}</span>
                    <div className="space-y-1 mt-1">
                      {printWithTasks && cPosts.map(p => {
                        const pColor = getPrintPostColor(p);
                        return (
                          <div key={p.id} className="text-[8px] p-1 border border-black font-black truncate" style={{ backgroundColor: pColor }}>
                            🏁 {p.text}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default FacebookSchedulerPage;
