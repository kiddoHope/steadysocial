import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Alert from '../components/ui/Alert';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Select from '../components/ui/Select';
import TipTapEditor from '../components/planning/TipTapEditor';
import {
  PlanningItem,
  PlanningFileContent,
  getPlanningFiles,
  createPlanningFolder,
  createPlanningFile,
  getPlanningFileContent,
  getPlanningFileRawUrl,
  deletePlanningItem,
  renamePlanningItem,
  searchPlanningWorkspace,
  SearchResult
} from '../services/planningService';
import {
  dbGetSchedulerHistory,
  dbAddSchedulerHistory,
  SchedulerHistoryEntry
} from '../services/campaignService';

const PlanningPage: React.FC = () => {
  const [files, setFiles] = useState<PlanningItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals / Input State
  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');

  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('');
  const [newFileType, setNewFileType] = useState<'md' | 'csv' | 'html'>('md');
  const [newFileContent, setNewFileContent] = useState<string>('');

  // Active Selected File Workspace State
  const [activeFile, setActiveFile] = useState<PlanningItem | null>(null);
  const [activeFileContent, setActiveFileContent] = useState<PlanningFileContent | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editText, setEditText] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Pin File State (persisted in localStorage)
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('planning_pins');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Success state
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Rename states
  const [renamingItem, setRenamingItem] = useState<PlanningItem | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  // Obsidian-like Search / Quick Switcher
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Excel / CSV State
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [csvSearch, setCsvSearch] = useState<string>('');

  // Connected Calendar State
  const [calendarHistory, setCalendarHistory] = useState<SchedulerHistoryEntry[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState<boolean>(false);
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [scheduleText, setScheduleText] = useState<string>('');
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [schedulePage, setSchedulePage] = useState<string>('STEADYSOCIAL CORE');
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
  const [showExtractTasksModal, setShowExtractTasksModal] = useState<boolean>(false);
  const [isExtractingTasks, setIsExtractingTasks] = useState<boolean>(false);
  const [extractedTasks, setExtractedTasks] = useState<any[]>([]);
  const [selectedTasksForCreation, setSelectedTasksForCreation] = useState<Set<number>>(new Set());

  const handleTogglePin = useCallback((item: PlanningItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedPaths(prev => {
      const next = new Set(prev);
      if (next.has(item.path)) {
        next.delete(item.path);
      } else {
        next.add(item.path);
      }
      try {
        localStorage.setItem('planning_pins', JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  const loadCalendarHistory = async () => {
    setIsLoadingCalendar(true);
    try {
      const data = await dbGetSchedulerHistory();
      const sorted = [...data].sort((a, b) => {
        const timeA = a.recordedAt || new Date(a.time).getTime() || 0;
        const timeB = b.recordedAt || new Date(b.time).getTime() || 0;
        return timeB - timeA;
      });
      setCalendarHistory(sorted.slice(0, 5));
    } catch (err: any) {
      console.error('Failed to load scheduler calendar feed:', err);
    } finally {
      setIsLoadingCalendar(false);
    }
  };

  const handleExtractTasksFromFile = async () => {
    if (!activeFile || !activeFileContent?.content) return;

    setIsExtractingTasks(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3001/planning/extract-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: activeFile.path }),
      });

      if (!response.ok) {
        throw new Error('Failed to extract tasks');
      }

      const result = await response.json();
      setExtractedTasks(result.tasks || []);
      setSelectedTasksForCreation(new Set(result.tasks.map((_: any, idx: number) => idx)));
      setShowExtractTasksModal(true);

      if (result.taskCount === 0) {
        setError('No tasks found in file. Use format: - [ ] Task Name | due: 2026-05-30 | priority: HIGH | milestones: Step1,Step2');
      }
    } catch (err: any) {
      setError(`EXTRACTION_FAILED: ${err.message}`);
    } finally {
      setIsExtractingTasks(false);
    }
  };

  const handleCreateExtractedTasks = async () => {
    setIsExtractingTasks(true);
    setError(null);

    try {
      let createdCount = 0;
      for (const index of selectedTasksForCreation) {
        const task = extractedTasks[index];
        if (!task) continue;

        const schedulerTask = {
          text: task.text,
          description: task.description || '',
          time: task.dueDate || new Date().toISOString(),
          page: task.page || 'PLANNING_MODULE',
          type: 'TASK',
          priority: task.priority || 'MEDIUM',
          status: 'PENDING',
          milestones: task.milestones || [],
          implementationFile: activeFile?.path,
          completionPercentage: 0,
        };

        await fetch('http://localhost:3001/scheduler/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(schedulerTask),
        });

        createdCount++;
      }

      setSuccessMsg(`TRANSMITTED: ${createdCount} tasks created with milestones in scheduler!`);
      loadCalendarHistory();
      setShowExtractTasksModal(false);
      setExtractedTasks([]);
      setSelectedTasksForCreation(new Set());

      setTimeout(() => setSuccessMsg(null), 2000);
    } catch (err: any) {
      setError(`TASK_CREATION_FAILED: ${err.message}`);
    } finally {
      setIsExtractingTasks(false);
    }
  };


  const handleOpenScheduleModal = () => {
    if (!activeFile) return;
    
    // Default pre-fill text
    let initialText = `EXECUTE PLAN MODULE [${activeFile.name.toUpperCase()}]:\n`;
    if (activeFileContent?.content) {
      // Grab the first header or executive summary if present
      const lines = activeFileContent.content.split('\n');
      const firstHeading = lines.find(l => l.startsWith('#'));
      if (firstHeading) {
        initialText += `${firstHeading.replace(/[#*]/g, '').trim()}\n`;
      }
      const bullets = lines.filter(l => l.startsWith('-') || l.startsWith('*')).slice(0, 3).map(b => b.replace(/^[-*\s]+/, ''));
      if (bullets.length > 0) {
        initialText += `\nKEY ACTIONS:\n` + bullets.map(b => `- ${b}`).join('\n');
      }
    }
    
    setScheduleText(initialText);
    
    // Set default target date to tomorrow at 9 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    const formatted = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T09:00`;
    setScheduleDate(formatted);
    
    setShowScheduleModal(true);
  };

  const handleScheduleToCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleText.trim() || !activeFile) return;

    try {
      // Extract bullet points as checkpoints dynamically
      let parsedMilestones: { label: string; completed: boolean }[] = [];
      if (activeFileContent?.content) {
        const lines = activeFileContent.content.split('\n');
        const bullets = lines
          .filter(l => l.startsWith('-') || l.startsWith('*'))
          .slice(0, 5)
          .map(b => b.replace(/^[-*\s]+/, '').trim())
          .filter(Boolean);
        
        parsedMilestones = bullets.map(b => ({ label: b, completed: false }));
      }

      const newEntry: Partial<SchedulerHistoryEntry> = {
        text: scheduleText,
        time: scheduleDate || new Date().toISOString(),
        page: schedulePage,
        status: scheduleDate ? 'SCHEDULED' : 'PUBLISHED',
        type: 'IMPLEMENTATION',
        priority: 'HIGH',
        implementationFile: activeFile.path,
        milestones: parsedMilestones,
        completionPercentage: parsedMilestones.length > 0 ? 0 : undefined
      };

      await dbAddSchedulerHistory(newEntry);
      
      setScheduleSuccess(`TRANSMITTED: Strategic plan scheduled successfully with ${parsedMilestones.length} action milestones!`);
      setScheduleText('');
      setScheduleDate('');
      
      loadCalendarHistory();

      setTimeout(() => {
        setShowScheduleModal(false);
        setScheduleSuccess(null);
      }, 1500);
    } catch (err: any) {
      setError(`SCHEDULE_FAILURE: ${err.message}`);
    }
  };

  const loadFiles = async (path: string = currentPath) => {
    setIsLoading(true);
    try {
      const data = await getPlanningFiles(path);
      // Sort: Directories first, then files alphabetically
      const sorted = [...data].sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(sorted);
      setError(null);
    } catch (err: any) {
      setError(`LOAD_FAILURE: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles(currentPath);
    loadCalendarHistory();
  }, [currentPath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearchModal(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setShowCreateModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleGlobalSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchPlanningWorkspace(query);
      setSearchResults(results);
    } catch (err: any) {
      setError(`SEARCH_FAILED: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSelect = async (path: string) => {
    setShowSearchModal(false);
    setSearchQuery('');
    setSearchResults([]);
    const itemName = path.split('/').pop() || path;
    const itemType = path.split('.').pop() || 'md';
    const item = files.find(f => f.path === path) || { name: itemName, path, type: 'file', fileType: itemType };
    await handleSelectFile(item as PlanningItem);
  };

  const processMarkdownText = (text: string) => {
    if (!text) return '';
    return text
      .replace(/\[\[(.*?)\]\]/g, '[$1](#link:$1)')
      .replace(/(?<=^|\s)#([a-zA-Z0-9_-]+)/g, ' [#$1](#tag:$1)');
  };

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setActiveFile(null);
    setActiveFileContent(null);
    setIsEditing(false);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const fullFolderPath = currentPath ? `${currentPath}/${newFolderName.trim()}` : newFolderName.trim();
    try {
      await createPlanningFolder(fullFolderPath);
      setNewFolderName('');
      setShowFolderModal(false);
      loadFiles();
    } catch (err: any) {
      setError(`FOLDER_CREATION_FAILED: ${err.message}`);
    }
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    const cleanedName = newFileName.trim().endsWith(`.${newFileType}`)
      ? newFileName.trim()
      : `${newFileName.trim()}.${newFileType}`;

    const fullFilePath = currentPath ? `${currentPath}/${cleanedName}` : cleanedName;

    try {
      let finalContent = newFileContent;
      if (newFileType === 'md' && !finalContent) {
        finalContent = `# ${newFileName.trim().toUpperCase()} PLAN\n\n## 1. OBJECTIVES\n- Add strategic objectives here\n\n## 2. TIMELINE\n- Q1: Initial Research\n- Q2: Implementation\n\n## 3. KEY METRICS\n- KPI 1: Lead Conversion Ratio`;
      } else if (newFileType === 'csv' && !finalContent) {
        finalContent = `TASK,OWNER,STATUS,BUDGET\nDesign Campaigns,Agent,COMPLETED,₱5000\nContent Scheduling,User,IN_PROGRESS,₱2000\nLead Processing,AI Assistant,DRAFT,₱10000`;
      } else if (newFileType === 'html' && !finalContent) {
        finalContent = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; background-color: #FFFDF5; color: #000; padding: 20px; text-align: center; }
    .slide { border: 4px solid #000; box-shadow: 8px 8px 0 #000; background: #fff; padding: 40px; max-width: 600px; margin: 40px auto; }
    h1 { text-transform: uppercase; color: #FF6B6B; font-size: 2.5rem; }
    p { font-size: 1.2rem; font-weight: bold; }
    .badge { display: inline-block; background: #FFD93D; border: 2px solid #000; padding: 5px 15px; font-weight: 900; }
  </style>
</head>
<body>
  <div class="slide">
    <h1>Strategic Plan Slides</h1>
    <p>Use the MCP Agent or editor to refine this planning visualization.</p>
    <div class="badge">STEADYSOCIAL OS</div>
  </div>
</body>
</html>`;
      }

      await createPlanningFile(fullFilePath, newFileType, finalContent, false);
      setNewFileName('');
      setNewFileContent('');
      setShowCreateModal(false);
      loadFiles();
    } catch (err: any) {
      setError(`FILE_CREATION_FAILED: ${err.message}`);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name;
    const ext = name.split('.').pop()?.toLowerCase();
    
    if (!ext || !['md', 'docx', 'xlsx', 'csv', 'html', 'pdf'].includes(ext)) {
      setError(`UNSUPPORTED_FORMAT: SteadySocial Planning Workspace only supports .md, .docx, .xlsx, .csv, .html, and .pdf.`);
      return;
    }

    const fullFilePath = currentPath ? `${currentPath}/${name}` : name;
    const reader = new FileReader();

    setIsLoading(true);
    try {
      if (['md', 'csv', 'html', 'txt'].includes(ext)) {
        reader.onload = async (event) => {
          const text = event.target?.result as string;
          await createPlanningFile(fullFilePath, ext as any, text, false);
          loadFiles();
        };
        reader.readAsText(file);
      } else {
        reader.onload = async (event) => {
          const dataUrl = event.target?.result as string;
          const base64 = dataUrl.split(',')[1];
          await createPlanningFile(fullFilePath, ext as any, base64, true);
          loadFiles();
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      setError(`IMPORT_FAILURE: ${err.message}`);
      setIsLoading(false);
    }
  };

  const handleSelectFile = async (item: PlanningItem) => {
    setActiveFile(item);
    setIsLoadingContent(true);
    setIsEditing(false);
    try {
      const content = await getPlanningFileContent(item.path);
      setActiveFileContent(content);
      
      if (content.fileType === 'xlsx' && content.sheets) {
        const sheetNames = Object.keys(content.sheets);
        if (sheetNames.length > 0) {
          setActiveSheet(sheetNames[0]);
        }
      }

      setEditText(content.content || '');
    } catch (err: any) {
      setError(`CONTENT_LOAD_FAILED: ${err.message}`);
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!activeFile) return;
    setIsLoadingContent(true);
    try {
      await createPlanningFile(activeFile.path, activeFile.fileType as any, editText, false);
      setIsEditing(false);
      // Reload content
      const content = await getPlanningFileContent(activeFile.path);
      setActiveFileContent(content);
    } catch (err: any) {
      setError(`SAVE_FAILURE: ${err.message}`);
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleDeleteItem = async (item: PlanningItem) => {
    if (!window.confirm(`DELETE_PERMANENTLY: "${item.name}"?`)) return;
    try {
      await deletePlanningItem(item.path);
      if (activeFile?.path === item.path) {
        setActiveFile(null);
        setActiveFileContent(null);
      }
      loadFiles();
    } catch (err: any) {
      setError(`DELETE_FAILURE: ${err.message}`);
    }
  };

  const handleStartRename = (item: PlanningItem) => {
    setRenamingItem(item);
    setRenameValue(item.name);
  };

  const handleRename = async () => {
    if (!renamingItem || !renameValue.trim() || renameValue.trim() === renamingItem.name) {
      setRenamingItem(null);
      return;
    }

    const parentDir = renamingItem.path.includes('/')
      ? renamingItem.path.slice(0, renamingItem.path.lastIndexOf('/'))
      : '';

    const newPath = parentDir ? `${parentDir}/${renameValue.trim()}` : renameValue.trim();

    try {
      await renamePlanningItem(renamingItem.path, newPath);
      setRenamingItem(null);
      loadFiles();
    } catch (err: any) {
      setError(`RENAME_FAILURE: ${err.message}`);
    }
  };

  // Breadcrumbs Generator
  const renderBreadcrumbs = () => {
    const parts = currentPath.split('/').filter(Boolean);
    return (
      <div className="flex items-center gap-2 font-black uppercase text-sm mb-6 bg-white py-3 px-4 neo-border-sm neo-shadow-sm flex-wrap">
        <button
          onClick={() => handleNavigate('')}
          className="text-neo-accent hover:underline flex items-center gap-1"
        >
          <i className="fas fa-hdd"></i> ROOT_PLANS
        </button>
        {parts.map((part, index) => {
          const pathTillNow = parts.slice(0, index + 1).join('/');
          return (
            <React.Fragment key={index}>
              <span className="opacity-30">/</span>
              <button
                onClick={() => handleNavigate(pathTillNow)}
                className="text-neo-black hover:underline"
              >
                {part}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'md': return { icon: 'fa-file-alt text-neo-accent', color: 'border-[#FF6B6B] bg-[#FF6B6B]/10' };
      case 'docx': return { icon: 'fa-file-word text-[#C4B5FD]', color: 'border-[#C4B5FD] bg-[#C4B5FD]/10' };
      case 'xlsx': return { icon: 'fa-file-excel text-[#FFD93D]', color: 'border-[#FFD93D] bg-[#FFD93D]/10' };
      case 'csv': return { icon: 'fa-file-csv text-teal-500', color: 'border-teal-500 bg-teal-500/10' };
      case 'html': return { icon: 'fa-file-code text-orange-500', color: 'border-orange-500 bg-orange-500/10' };
      case 'pdf': return { icon: 'fa-file-pdf text-red-500', color: 'border-red-500 bg-red-500/10' };
      default: return { icon: 'fa-file text-gray-500', color: 'border-gray-500 bg-gray-500/10' };
    }
  };

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-8 max-w-[1700px] w-full mx-auto flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="inline-block bg-neo-black text-white px-2 py-0.5 mb-2 neo-border-sm rotate-1">
            <span className="text-[10px] font-black uppercase tracking-widest">OS_MODULE // COGNITIVE_PLANE</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-neo-black leading-none">
            PLANNING_<span className="text-neo-accent">WORKSPACE</span>
          </h1>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button variant="primary" onClick={() => setShowSearchModal(true)} className="bg-neo-black text-white hover:bg-neo-accent">
            <i className="fas fa-search mr-2"></i> SEARCH (CTRL+K)
          </Button>
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            <i className="fas fa-plus mr-2"></i> NEW_PLAN_FILE
          </Button>
          <Button variant="secondary" onClick={() => setShowFolderModal(true)}>
            <i className="fas fa-folder-plus mr-2"></i> NEW_FOLDER
          </Button>
          <label className="flex items-center px-4 py-2 my-1 font-black uppercase text-xs neo-border-sm bg-neo-secondary hover:bg-white neo-shadow-sm neo-btn-active cursor-pointer transition-all">
            <i className="fas fa-file-import mr-2"></i> IMPORT_EXTERNAL
            <input type="file" accept=".md,.docx,.xlsx,.csv,.html,.pdf" className="hidden" onChange={handleImportFile} />
          </label>
        </div>
      </header>

      {successMsg && <Alert type="success" message={successMsg} onClose={() => setSuccessMsg(null)} className="mx-auto max-w-[1700px] w-full mb-4" />}

      <main className="relative z-10 max-w-[1700px] w-full mx-auto flex-1 flex flex-col lg:flex-row gap-8 items-stretch">
        {/* Left Side: Directory and Files Sidebar */}
        <div className="w-full lg:w-[350px] xl:w-[400px] flex-shrink-0 flex flex-col">
          {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-6" />}
          
          {renderBreadcrumbs()}

          {/* ── Pinned Files Section ── */}
          {pinnedPaths.size > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">📌 PINNED</span>
                <div className="flex-1 h-px bg-neo-black/20" />
              </div>
              <div className="flex flex-col gap-2">
                {[...pinnedPaths].map(pinnedPath => {
                  const pinnedItem = (() => {
                    // Try to find from current files, fall back to reconstructed
                    const found = files.find(f => f.path === pinnedPath);
                    if (found) return found;
                    const name = pinnedPath.split('/').pop() || pinnedPath;
                    const ext = name.includes('.') ? name.split('.').pop() : undefined;
                    return { name, path: pinnedPath, type: 'file' as const, fileType: ext };
                  })();
                  const fileStyle = getFileIcon(pinnedItem.fileType || '');
                  const isActive = activeFile?.path === pinnedItem.path;
                  return (
                    <div
                      key={pinnedPath}
                      onClick={() => handleSelectFile(pinnedItem as PlanningItem)}
                      className={`flex items-center gap-3 p-2 border-2 border-neo-black cursor-pointer transition-all hover:bg-neo-secondary/30 ${
                        isActive ? 'bg-neo-secondary/20 translate-x-[2px]' : 'bg-white'
                      }`}
                    >
                      <div className={`w-8 h-8 border-2 border-neo-black flex items-center justify-center flex-shrink-0 ${fileStyle.color}`}>
                        <i className={`fas ${fileStyle.icon} text-xs`} />
                      </div>
                      <span className="font-black uppercase text-xs tracking-tight truncate flex-1">{pinnedItem.name}</span>
                      <button
                        onClick={e => handleTogglePin(pinnedItem as PlanningItem, e)}
                        className="text-yellow-500 hover:text-neo-black transition-colors p-1 flex-shrink-0"
                        title="Unpin"
                      >
                        <i className="fas fa-thumbtack text-xs" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-20">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
              {/* If in subfolder, render Go Back folder */}
              {currentPath && (
                <Card
                  onClick={() => {
                    const idx = currentPath.lastIndexOf('/');
                    handleNavigate(idx !== -1 ? currentPath.slice(0, idx) : '');
                  }}
                  className="bg-white/80 border-dashed neo-shadow-sm hover:translate-y-[-2px] cursor-pointer transition-all flex items-center gap-4 p-4 border-4 border-neo-black !p-0"
                >
                  <div className="w-12 h-12 neo-border-sm bg-neo-black text-white flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-arrow-left text-xl"></i>
                  </div>
                  <div className="min-w-0">
                    <span className="font-black uppercase text-xs tracking-wider opacity-60">PARENT_DIRECTORY</span>
                    <h3 className="font-black uppercase text-sm leading-tight text-neo-black">GO_BACK</h3>
                  </div>
                </Card>
              )}

              {files.map(item => {
                const isDir = item.type === 'directory';
                const fileStyle = !isDir ? getFileIcon(item.fileType || '') : null;

                return (
                  <Card
                    key={item.path}
                    className={`bg-white neo-shadow-sm hover:neo-shadow-md cursor-pointer transition-all relative overflow-hidden group border-4 border-neo-black ${
                      activeFile?.path === item.path ? 'bg-neo-secondary/20 translate-x-[2px] translate-y-[2px]' : ''
                    }`}
                    onClick={() => {
                      if (isDir) {
                        handleNavigate(item.path);
                      } else {
                        handleSelectFile(item);
                      }
                    }}
                  >
                    <div className='flex items-center justify-between w-full'>
                      <div className="flex-1 min-w-0 flex items-center gap-4 p-2">
                        {isDir ? (
                          <div className="w-12 h-12 neo-border-sm bg-neo-secondary flex items-center justify-center rotate-[-2deg] flex-shrink-0">
                            <i className="fas fa-folder text-2xl text-neo-black"></i>
                          </div>
                        ) : (
                          <div className={`w-12 h-12 neo-border-sm flex items-center justify-center rotate-[2deg] flex-shrink-0 ${fileStyle?.color}`}>
                            <i className={`fas ${fileStyle?.icon} text-xl`}></i>
                          </div>
                        )}

                        <div className="flex-1 min-w-0 pr-6">
                          {renamingItem?.path === item.path ? (
                            <div className="flex gap-2 items-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="text"
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                className="neo-border-sm px-2 py-1 text-xs font-bold uppercase w-full bg-white text-neo-black"
                              />
                              <button onClick={handleRename} className="bg-neo-black text-white neo-border-sm px-2 py-1 text-xs font-black">
                                OK
                              </button>
                              <button onClick={() => setRenamingItem(null)} className="bg-white text-neo-black neo-border-sm px-2 py-1 text-xs font-black">
                                X
                              </button>
                            </div>
                          ) : (
                            <>
                              <h3 className="font-black text-sm uppercase tracking-tight truncate leading-tight w-full">
                                {item.name}
                              </h3>
                              <span className="text-[9px] font-black uppercase tracking-widest opacity-40 truncate block w-full">
                                {isDir ? 'DIRECTORY' : `${item.fileType?.toUpperCase()} _ FILE`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Hover action controls */}
                      <div
                        className='flex-shrink-0 flex items-center gap-2'
                        onClick={e => e.stopPropagation()}
                      >
                        {!isDir && (
                          <button
                            onClick={e => handleTogglePin(item, e)}
                            className={`p-1 transition-colors ${
                              pinnedPaths.has(item.path)
                                ? 'text-yellow-500 hover:text-neo-black'
                                : 'opacity-30 hover:opacity-100 hover:text-yellow-500'
                            }`}
                            title={pinnedPaths.has(item.path) ? 'UNPIN' : 'PIN'}
                          >
                            <i className="fas fa-thumbtack text-sm"></i>
                          </button>
                        )}
                        <button
                          onClick={() => handleStartRename(item)}
                          className="p-1 hover:text-neo-accent transition-colors"
                          title="RENAME"
                        >
                          <i className="fas fa-edit text-sm"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="p-1 hover:text-red-500 transition-colors"
                          title="DELETE"
                        >
                          <i className="fas fa-trash text-sm"></i>
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}

              {files.length === 0 && !isLoading && (
                <div className="col-span-full text-center py-20 bg-neo-muted/20 border-4 border-dashed border-neo-black rotate-1 neo-shadow-sm">
                  <i className="fas fa-folder-open text-5xl opacity-20 mb-4"></i>
                  <p className="font-black uppercase tracking-widest opacity-40">FOLDER IS EMPTY</p>
                  <p className="text-[10px] font-black uppercase opacity-30 mt-2">Use headers or MCP agent to generate plan modules here.</p>
                </div>
              )}
            </div>
          )}

          {/* Calendar Connected Timeline Feed */}
          <Card title="📅 CALENDAR_CONNECTED_TIMELINE" className="bg-white neo-shadow-sm border-4 border-neo-black mt-8 flex flex-col">
            <div className="p-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Connected Scheduler Feeds</span>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse neo-border-sm" title="Live Synced"></span>
              </div>
              
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {isLoadingCalendar ? (
                  <div className="py-8 flex justify-center">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : calendarHistory.length > 0 ? (
                  calendarHistory.map((item) => {
                    const postDate = new Date(item.time);
                    const isTask = item.type === 'TASK' || item.type === 'IMPLEMENTATION';
                    
                    // Determine display status for tasks
                    let postStatus = item.status;
                    if (isTask) {
                      if (item.status === 'COMPLETE') {
                        postStatus = 'COMPLETE';
                      } else {
                        const itemTime = new Date(item.time).getTime();
                        const now = new Date().getTime();
                        postStatus = itemTime < now ? 'DUE' : 'PENDING';
                      }
                    }

                    const isDone = postStatus === 'COMPLETE' || postStatus === 'PUBLISHED';

                    let badgeClass = 'bg-neo-accent text-white border-neo-black';
                    if (postStatus === 'PUBLISHED') badgeClass = 'bg-gray-200 text-gray-500 border-gray-400';
                    else if (postStatus === 'COMPLETE') badgeClass = 'bg-gray-200 text-gray-500 border-gray-400';
                    else if (postStatus === 'DUE') badgeClass = 'bg-red-200 text-red-950 border-red-400 animate-pulse';
                    else if (postStatus === 'PENDING') badgeClass = 'bg-yellow-200 text-yellow-950 border-yellow-400';

                    return (
                      <div key={item.id} className={`p-3 neo-border-sm text-neo-black relative group hover:bg-white transition-colors duration-150 ${isDone ? 'bg-gray-100 opacity-55' : 'bg-neo-bg'}`}>
                        <div className="flex justify-between items-start gap-2 mb-1.5">
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 border ${badgeClass}`}>
                            {isDone && <i className="fas fa-check mr-1"></i>}
                            {postStatus}
                          </span>
                          <span className="text-[9px] font-black opacity-50">
                            {postDate.toLocaleDateString()} {postDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={`text-[11px] font-bold leading-normal truncate ${isDone ? 'line-through text-gray-400' : ''}`}>{item.text}</p>
                        <div className="text-[8px] font-black uppercase tracking-wider opacity-40 mt-1">
                          Node: {item.page.toUpperCase()}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-10 opacity-30 uppercase font-black text-[10px] tracking-wider border-2 border-dashed border-neo-black">
                    No timeline actions scheduled.
                  </div>
                )}
              </div>

              <Link
                to="/facebook-scheduler"
                className="block text-center w-full py-2 bg-neo-accent text-white font-black uppercase text-xs neo-border neo-shadow-sm neo-btn-active hover:translate-y-[-2px] transition-all"
              >
                <i className="fas fa-calendar-alt mr-2"></i> OPEN_FULL_CALENDAR
              </Link>
            </div>
          </Card>
        </div>

        {/* Right Side: Interactive Preview / Content Workspace Panel */}
        <div className={`flex-1 flex flex-col min-w-0 ${isFullscreen ? 'z-50' : ''}`}>
          {activeFile ? (
            <div className={`bg-white neo-border neo-shadow-md transition-all duration-200 flex flex-col ${
              isFullscreen
                ? 'fixed inset-4 z-50 neo-shadow-2xl overflow-hidden'
                : 'neo-shadow-md flex-1'
            }`}>
              {/* Workspace Header */}
              <div className="flex justify-between items-center bg-neo-black text-white p-4 border-b-4 border-neo-black flex-shrink-0 flex-wrap gap-2">
                <div className="min-w-0 pr-4">
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-60">WORKSPACE // PLAN_VIEWER</span>
                  <h2 className="font-black uppercase text-sm truncate">{activeFile.name}</h2>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-neo-secondary text-neo-black border-2 border-neo-black font-black uppercase hover:bg-white"
                    onClick={handleOpenScheduleModal}
                  >
                    <i className="fas fa-calendar-plus mr-1"></i> CONNECT_TO_CALENDAR
                  </Button>
                  {['md', 'csv', 'html'].includes(activeFile.fileType || '') && !isLoadingContent && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="bg-neo-secondary text-neo-black border-2 border-neo-black font-black uppercase hover:bg-white"
                      onClick={handleExtractTasksFromFile}
                      disabled={isExtractingTasks}
                    >
                      <i className="fas fa-tasks mr-1"></i> {isExtractingTasks ? 'EXTRACTING...' : 'EXTRACT_TASKS'}
                    </Button>
                  )}
                  {/* TipTap edit toggle — only for md files */}
                  {activeFile.fileType === 'md' && !isLoadingContent && (
                    <Button
                      variant={isEditing ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => {
                        setIsEditing(!isEditing);
                        if (!isEditing && activeFileContent) {
                          setEditText(activeFileContent.content || '');
                        }
                      }}
                    >
                      <i className={`fas ${isEditing ? 'fa-times' : 'fa-pen-nib'} mr-1`} />
                      {isEditing ? 'CANCEL_EDIT' : 'WYSIWYG_EDIT'}
                    </Button>
                  )}
                  {/* Legacy edit for csv/html */}
                  {['csv', 'html'].includes(activeFile.fileType || '') && !isLoadingContent && (
                    <Button
                      variant={isEditing ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => {
                        setIsEditing(!isEditing);
                        if (!isEditing && activeFileContent) {
                          setEditText(activeFileContent.content || activeFileContent.html || '');
                        }
                      }}
                    >
                      {isEditing ? 'CANCEL_EDIT' : 'INLINE_EDIT'}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-neo-secondary text-neo-black border-2 border-neo-black font-black uppercase hover:bg-white"
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  >
                    <i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'} mr-1`}></i>
                    {isFullscreen ? 'EXIT' : 'FULLSCREEN'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => { setActiveFile(null); setActiveFileContent(null); setIsFullscreen(false); }}>
                    CLOSE
                  </Button>
                </div>
              </div>

              {/* Workspace body — direct flex child, so flex-1 actually works */}
              <div className={`flex-1 min-h-0 overflow-y-auto p-6 relative ${
                isFullscreen
                  ? ''
                  : 'min-h-[500px] max-h-[80vh]'
              }`}>
                {isLoadingContent ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                    <LoadingSpinner size="lg" />
                  </div>
                ) : null}

                {activeFileContent && (
                  <>
                    {/* ── TIPTAP for .md files (read + edit unified) ── */}
                    {activeFileContent.fileType === 'md' && (
                      <div className="flex flex-col gap-0 min-h-0">
                        <TipTapEditor
                          content={activeFileContent.content || ''}
                          editable={isEditing}
                          onChange={md => setEditText(md)}
                          placeholder="START WRITING YOUR PLAN MODULE HERE..."
                        />
                        {isEditing && (
                          <div className="flex gap-3 p-3 border-t-4 border-neo-black bg-neo-bg flex-shrink-0">
                            <Button variant="primary" className="flex-1" onClick={handleSaveEdit}>
                              <i className="fas fa-save mr-2" />SAVE_CHANGES
                            </Button>
                            <Button variant="secondary" onClick={() => setIsEditing(false)}>
                              CANCEL
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Legacy edit mode for csv / html ── */}
                    {['csv', 'html'].includes(activeFileContent.fileType) && isEditing && (
                      <div className="h-full flex flex-col gap-4">
                        <textarea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          rows={18}
                          className="w-full flex-1 p-4 neo-border-sm font-mono text-sm leading-relaxed bg-neo-bg text-neo-black focus:outline-none"
                          placeholder="WRITE PLAN MODULE TEXT HERE..."
                        />
                        <Button variant="primary" className="w-full text-center" onClick={handleSaveEdit}>
                          SAVE_CHANGES
                        </Button>
                      </div>
                    )}

                    {/* ── Read view for non-md, non-edit ── */}
                    {!(['md'].includes(activeFileContent.fileType)) && (
                      /* READ / DISPLAY VIEW MODE for CSV, HTML, XLSX, DOCX */
                      <div className="h-full">

                        {/* WORD DOCUMENT MAMMOTH HTML VIEWER */}
                        {activeFileContent.fileType === 'docx' && (
                          <div
                            className="prose prose-sm max-w-none break-words font-space docx-rendered text-neo-black"
                            dangerouslySetInnerHTML={{ __html: activeFileContent.html || '<p className="italic">No text found in Word document.</p>' }}
                          />
                        )}

                        {/* SPREADSHEET XLSX / CSV GRIDS */}
                        {(activeFileContent.fileType === 'xlsx' || activeFileContent.fileType === 'csv') && (
                          <div className="flex flex-col h-full gap-4">
                            {/* XLSX Sheet Navigator Tabs */}
                            {activeFileContent.fileType === 'xlsx' && activeFileContent.sheets && (
                              <div className="flex gap-2 border-b-2 border-neo-black pb-2 overflow-x-auto">
                                {Object.keys(activeFileContent.sheets).map(sheetName => (
                                  <button
                                    key={sheetName}
                                    onClick={() => setActiveSheet(sheetName)}
                                    className={`px-3 py-1 font-black uppercase text-xs neo-border-sm ${
                                      activeSheet === sheetName ? 'bg-neo-secondary text-neo-black neo-shadow-sm' : 'bg-white hover:bg-neo-bg text-neo-black'
                                    }`}
                                  >
                                    {sheetName}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Spreadsheet Quick search */}
                            <div className="flex-shrink-0">
                              <Input
                                placeholder="FILTER_SPREADSHEET_ROWS..."
                                value={csvSearch}
                                onChange={e => setCsvSearch(e.target.value)}
                              />
                            </div>

                            {/* Render Table Grid */}
                            <div className="overflow-x-auto neo-border-sm bg-white">
                              <table className="w-full border-collapse font-space text-xs">
                                <thead>
                                  {(() => {
                                    const rows = activeFileContent.fileType === 'xlsx'
                                      ? (activeFileContent.sheets?.[activeSheet] || [])
                                      : (activeFileContent.data || []);
                                    if (rows.length === 0) return null;
                                    const headers = rows[0];

                                    return (
                                      <tr className="bg-neo-black text-white uppercase font-black border-b-2 border-neo-black">
                                        <th className="p-3 text-center border-r border-white/20 w-8">#</th>
                                        {headers.map((cell: any, cellIdx: number) => (
                                          <th key={cellIdx} className="p-3 text-left border-r border-white/20 font-black">
                                            {cell || `COLUMN_${cellIdx + 1}`}
                                          </th>
                                        ))}
                                      </tr>
                                    );
                                  })()}
                                </thead>
                                <tbody>
                                  {(() => {
                                    const rows = activeFileContent.fileType === 'xlsx'
                                      ? (activeFileContent.sheets?.[activeSheet] || [])
                                      : (activeFileContent.data || []);
                                    if (rows.length === 0) {
                                      return (
                                        <tr>
                                          <td className="p-6 text-center italic opacity-40" colSpan={10}>
                                            Empty Spreadsheet Sheet.
                                          </td>
                                        </tr>
                                      );
                                    }

                                    const dataRows = rows.slice(1);
                                    const filtered = dataRows.filter(row => {
                                      if (!csvSearch) return true;
                                      return row.some((cell: any) =>
                                        String(cell).toLowerCase().includes(csvSearch.toLowerCase())
                                      );
                                    });

                                    return filtered.map((row, rowIdx) => (
                                      <tr key={rowIdx} className="hover:bg-neo-bg border-b border-neo-black last:border-b-0 font-bold">
                                        <td className="p-3 text-center bg-neo-muted/10 border-r border-neo-black text-[10px] opacity-40 font-black">
                                          {rowIdx + 1}
                                        </td>
                                        {row.map((cell: any, cellIdx: number) => (
                                          <td key={cellIdx} className="p-3 border-r border-neo-black last:border-r-0">
                                            {cell}
                                          </td>
                                        ))}
                                      </tr>
                                    ));
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* INTERACTIVE HTML SLIDES / DOCK WIDGETS */}
                        {activeFileContent.fileType === 'html' && !isEditing && (
                          <div className={`neo-border-sm bg-white overflow-hidden relative ${isFullscreen ? 'h-[calc(100vh-200px)]' : 'h-[450px]'}`}>
                            <iframe
                              title="Plan Visualizer"
                              srcDoc={activeFileContent.html || ''}
                              sandbox="allow-scripts"
                              className="w-full h-full border-none bg-white"
                            />
                          </div>
                        )}

                        {/* HTML Edit Mode */}
                        {activeFileContent.fileType === 'html' && isEditing && (
                          <div className="h-full flex flex-col gap-4">
                            <textarea
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              rows={18}
                              className="w-full flex-1 p-4 neo-border-sm font-mono text-sm leading-relaxed bg-neo-bg text-neo-black focus:outline-none"
                              placeholder="WRITE HTML HERE..."
                            />
                            <Button variant="primary" className="w-full text-center" onClick={handleSaveEdit}>
                              SAVE_CHANGES
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* PDF VIEWER (Direct url binding into custom PDF browser engine iframe) */}
                {activeFile && activeFile.fileType === 'pdf' && (
                  <div className={`w-full neo-border-sm bg-white overflow-hidden relative ${isFullscreen ? 'h-[calc(100vh-200px)]' : 'h-[600px]'}`}>
                    <iframe
                      title="PDF Plane Viewer"
                      src={getPlanningFileRawUrl(activeFile.path)}
                      className="w-full h-full border-none"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Selected File Placeholder Card */
            <div className="bg-neo-secondary/10 border-4 border-dashed border-neo-black p-12 text-center neo-shadow-sm flex flex-col justify-center items-center flex-grow min-h-[500px]">
              <i className="fas fa-file-signature text-6xl text-neo-black opacity-20 mb-6 animate-pulse"></i>
              <h3 className="text-xl font-black uppercase tracking-tight opacity-40">Cognitive Plane Workspace</h3>
              <p className="text-xs uppercase font-black tracking-wider opacity-30 mt-2 max-w-sm leading-relaxed">
                Select planning documents to inspect details, visual presentations, interactive slide shows, spreadsheets, or compile custom PDFs.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* --- CREATE NEW PLAN FILE MODAL --- */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-neo-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card title="INITIATE_PLANNING_MODULE" className="w-full max-w-lg bg-white neo-shadow-lg p-2 animate-scale-up">
            <form onSubmit={handleCreateFile} className="space-y-6">
              <Input
                label="PLAN_FILENAME (E.G. marketing_q3)"
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                placeholder="marketing_campaign"
                required
              />

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-2">MODULE_FORMAT</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['md', 'csv', 'html'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewFileType(type)}
                      className={`py-2 px-3 neo-border-sm font-black uppercase text-xs tracking-wider transition-all ${
                        newFileType === type ? 'bg-neo-accent text-white neo-shadow-sm' : 'bg-white text-neo-black hover:bg-neo-bg'
                      }`}
                    >
                      {type === 'md' ? '📝 MARKDOWN' : type === 'csv' ? '📊 SPREADSHEET' : '💻 SLIDES / HTML'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-2">PREVIEW_TEMPLATE (OPTIONAL)</label>
                <textarea
                  value={newFileContent}
                  onChange={e => setNewFileContent(e.target.value)}
                  rows={6}
                  className="w-full p-3 neo-border-sm font-mono text-xs leading-relaxed bg-neo-bg text-neo-black focus:outline-none"
                  placeholder="LEAVE EMPTY FOR DEFAULT DESIGNED PLAN TEMPLATES..."
                />
              </div>

              <div className="flex gap-4">
                <Button type="submit" variant="primary" className="flex-grow">
                  COMPILE_FILE
                </Button>
                <Button variant="secondary" onClick={() => { setShowCreateModal(false); setNewFileName(''); setNewFileContent(''); }}>
                  CANCEL
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* --- CREATE NEW FOLDER MODAL --- */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-neo-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card title="CREATE_PLAN_FOLDER" className="w-full max-w-sm bg-white neo-shadow-lg p-2">
            <form onSubmit={handleCreateFolder} className="space-y-6">
              <Input
                label="FOLDER_NAME"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="E.G. Q3_EXPANSION"
                required
              />

              <div className="flex gap-4">
                <Button type="submit" variant="primary" className="flex-grow">
                  CREATE_FOLDER
                </Button>
                <Button variant="secondary" onClick={() => { setShowFolderModal(false); setNewFolderName(''); }}>
                  CANCEL
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* --- CONNECT & TRANSMIT TO CALENDAR MODAL --- */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-neo-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card 
            title="📅 TRANSMIT_PLAN_TO_CALENDAR" 
            className="w-full max-w-lg bg-white neo-shadow-lg p-2 animate-scale-up border-4 border-neo-black"
            actions={
              <button 
                onClick={() => setShowScheduleModal(false)}
                className="bg-white text-neo-black neo-border-sm px-2 py-0.5 text-xs font-black uppercase hover:bg-neo-accent hover:text-white"
              >
                CLOSE
              </button>
            }
          >
            {scheduleSuccess && <Alert type="success" message={scheduleSuccess} className="mb-4" />}
            
            <form onSubmit={handleScheduleToCalendar} className="space-y-6 p-2">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-2">TARGET_DESTINATION_PAGE</label>
                <Select
                  id="modalPageSelect"
                  value={schedulePage}
                  onChange={e => setSchedulePage(e.target.value)}
                  options={[
                    { value: 'STEADYSOCIAL CORE', label: 'STEADYSOCIAL CORE' },
                    { value: 'HERITAGE EDITION INVENTORY', label: 'HERITAGE EDITION INVENTORY' },
                    { value: 'CAMPAIGN MARKETING NODE', label: 'CAMPAIGN MARKETING NODE' }
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-2">CONTENT_PAYLOAD_MESSAGE</label>
                <textarea
                  value={scheduleText}
                  onChange={e => setScheduleText(e.target.value)}
                  rows={6}
                  className="w-full p-4 neo-border bg-neo-bg font-space font-bold text-sm focus:outline-none focus:ring-2 focus:ring-neo-accent resize-none text-neo-black"
                  placeholder="EXPLAIN ACTIONS OR CONTENT STRATEGY TO CALENDAR..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-2">SCHEDULED_TIMELINE_DATE_TIME</label>
                <Input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-4">
                <Button type="submit" variant="primary" className="flex-grow bg-neo-accent text-white border-2 border-neo-black font-black uppercase">
                  <i className="fas fa-paper-plane mr-2"></i> TRANSMIT_TO_CALENDAR
                </Button>
                <Button variant="secondary" onClick={() => { setShowScheduleModal(false); setScheduleText(''); }}>
                  CANCEL
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

 

      {/* --- EXTRACT TASKS FROM PLANNING FILE MODAL --- */}
      {showExtractTasksModal && (
        <div className="fixed inset-0 bg-neo-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card 
            title="🎯 EXTRACT_TASKS_FROM_PLANNING" 
            className="w-full max-w-2xl bg-white neo-shadow-lg p-2 border-4 border-neo-black"
          >
            <div className="p-4 space-y-6">
              {isExtractingTasks && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded">
                  <LoadingSpinner size="lg" />
                </div>
              )}

              <div>
                <span className="text-sm font-black uppercase tracking-wider">DETECTED {extractedTasks.length} TASKS</span>
                <p className="text-xs opacity-60 mt-1">Format: - [ ] Task | due: 2026-05-30 | priority: HIGH | milestones: Step1,Step2</p>
              </div>

              <div className="max-h-[400px] overflow-y-auto border-4 border-neo-black bg-neo-bg p-3 space-y-2">
                {extractedTasks.length > 0 ? (
                  extractedTasks.map((task, idx) => (
                    <div key={idx} className="p-3 bg-white neo-border-sm flex items-start gap-3 hover:bg-neo-secondary/20 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedTasksForCreation.has(idx)}
                        onChange={(e) => {
                          const newSet = new Set(selectedTasksForCreation);
                          if (e.target.checked) {
                            newSet.add(idx);
                          } else {
                            newSet.delete(idx);
                          }
                          setSelectedTasksForCreation(newSet);
                        }}
                        className="mt-1 w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black uppercase text-sm">{task.text}</h4>
                        {task.description && <p className="text-xs opacity-60 mt-1">{task.description}</p>}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {task.dueDate && (
                            <span className="text-[10px] bg-neo-accent text-white px-2 py-0.5 neo-border-sm font-black">
                              📅 {task.dueDate}
                            </span>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 neo-border-sm font-black ${
                            task.priority === 'CRITICAL' ? 'bg-red-500 text-white' :
                            task.priority === 'HIGH' ? 'bg-orange-500 text-white' :
                            task.priority === 'MEDIUM' ? 'bg-yellow-500 text-white' :
                            'bg-green-500 text-white'
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                        {task.milestones && task.milestones.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <span className="text-[10px] font-black uppercase opacity-60">Milestones:</span>
                            <div className="flex flex-wrap gap-1">
                              {task.milestones.map((m: any, mIdx: number) => (
                                <span key={mIdx} className="text-[9px] bg-neo-black/20 px-1.5 py-0.5 neo-border-sm font-bold">
                                  {m.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 opacity-40 font-black uppercase text-xs">
                    No tasks extracted. Use checkbox format in your planning file.
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <Button 
                  variant="primary" 
                  className="flex-grow bg-neo-accent text-white border-2 border-neo-black font-black uppercase"
                  onClick={handleCreateExtractedTasks}
                  disabled={selectedTasksForCreation.size === 0}
                >
                  <i className="fas fa-check-circle mr-2"></i> CREATE {selectedTasksForCreation.size} TASKS
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    setShowExtractTasksModal(false);
                    setExtractedTasks([]);
                    setSelectedTasksForCreation(new Set());
                  }}
                >
                  CANCEL
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Quick Switcher / Global Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-neo-bg/90 z-50 flex items-start justify-center pt-20 px-4 backdrop-blur-sm" onClick={() => setShowSearchModal(false)}>
          <Card className="w-full max-w-2xl bg-white neo-shadow-md border-4 border-neo-black flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b-4 border-neo-black flex items-center gap-3">
              <i className="fas fa-search text-xl opacity-50"></i>
              <input
                type="text"
                autoFocus
                className="flex-1 bg-transparent text-xl font-bold uppercase outline-none placeholder:opacity-30"
                placeholder="SEARCH KNOWLEDGE BASE OR #TAGS..."
                value={searchQuery}
                onChange={e => handleGlobalSearch(e.target.value)}
              />
              <button className="text-xs font-black uppercase opacity-50 hover:opacity-100" onClick={() => setShowSearchModal(false)}>ESC TO CLOSE</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {isSearching ? (
                <div className="py-12 flex justify-center"><LoadingSpinner size="md" /></div>
              ) : searchResults.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {searchResults.map((res, i) => (
                    <div
                      key={i}
                      className="p-3 border-2 border-transparent hover:border-neo-black hover:bg-neo-bg cursor-pointer transition-all flex flex-col gap-1"
                      onClick={() => handleSearchSelect(res.path)}
                    >
                      <h4 className="font-black text-sm uppercase">{res.name}</h4>
                      {res.snippet && (
                        <p className="text-xs opacity-70 italic truncate">"{res.snippet}"</p>
                      )}
                      {(res.tags.length > 0 || res.links.length > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {res.tags.map(t => (
                            <span key={t} className="text-[9px] font-black uppercase bg-neo-secondary px-1 py-0.5 rounded-sm">
                              {t}
                            </span>
                          ))}
                          {res.links.map(l => (
                            <span key={l} className="text-[9px] font-black uppercase bg-neo-accent text-white px-1 py-0.5 rounded-sm">
                              [[{l}]]
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : searchQuery ? (
                <div className="py-12 text-center opacity-40 font-black uppercase">NO RESULTS FOUND</div>
              ) : (
                <div className="py-12 text-center opacity-40 font-black uppercase text-xs">
                  TYPE TO SEARCH FILES, CONTENT, #TAGS, OR [[LINKS]]
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      <footer className="mt-12 py-8 text-center border-t-2 border-neo-black/5">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-20">
          PLANNING_WORKSPACE_MODULE // v2.0 // ELECTRON_SECURE_KERNEL
        </p>
      </footer>
    </div>
  );
};

export default PlanningPage;
