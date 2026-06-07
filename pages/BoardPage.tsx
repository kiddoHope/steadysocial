import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IconType } from 'react-icons';
import {
  FiBarChart2,
  FiBox,
  FiCode,
  FiCpu,
  FiDatabase,
  FiEdit2,
  FiFileText,
  FiGitBranch,
  FiGrid,
  FiEye,
  FiEyeOff,
  FiImage,
  FiLayers,
  FiMaximize2,
  FiMinus,
  FiMoon,
  FiMove,
  FiMousePointer,
  FiPlus,
  FiSquare,
  FiSun,
  FiTrash2,
  FiType,
  FiUsers,
  FiX,
  FiZap,
} from 'react-icons/fi';
import BoardCard from '../components/board/BoardCard';
import Frame from '../components/board/Frame';
import ConnectorLine from '../components/board/ConnectorLine';
import PendingConnectorLine from '../components/board/PendingConnectorLine';
import ScaleLabel from '../components/board/ScaleLabel';
import {
  getBoards,
  getBoardState,
  updateBoardState,
  deleteBoard,
  renameBoard,
} from '../services/boardService';
import { dbGetLeads, type Lead } from '../services/crmService';
import { getPlanningFiles, getPlanningFileContent, type PlanningItem } from '../services/planningService';

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

export type CardType =
  | 'sticky'
  | 'image'
  | 'text'
  | 'chart'
  | 'code'
  | 'table'
  | 'shape'
  | 'diagram'
  | 'frame';

export interface Card {
  id: string;
  type: CardType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: any;
  color?: string;
  rotation?: number;
  orientation?: 'portrait' | 'landscape';
  parentId?: string;
}

export interface Connector {
  id: string;
  from: string;
  to: string;
  label?: string;
  color?: string;
  strokeWidth?: number;
  dashed?: boolean;
}

export type Tool = 'select' | 'hand' | 'connector';

type PersistedBoardState = {
  cards: Card[];
  connectors: Connector[];
  tool: Tool;
  isFocusMode: boolean;
  viewport: Viewport;
};

interface BoardPageProps {
  workspace: string;
}

const BOARD_LIST_KEY = 'board-list';
const BOARD_WIDTH = 6400;
const BOARD_HEIGHT = 4200;
const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;
const DEFAULT_VIEWPORT: Viewport = { x: 240, y: 130, scale: 1 };
const BOARD_STORAGE_KEY = (workspace: string) => `board-state-${workspace}`;

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const hasBrowserStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

function uniqueId(prefix: string) {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getBoardList(fallbackBoard: string): string[] {
  if (!hasBrowserStorage()) return [fallbackBoard || 'default'];

  try {
    const data = localStorage.getItem(BOARD_LIST_KEY);
    const parsed = data ? JSON.parse(data) : [];
    const list = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    return Array.from(new Set([fallbackBoard || 'default', 'default', ...list]));
  } catch {
    return [fallbackBoard || 'default', 'default'];
  }
}

function saveBoardList(list: string[]) {
  if (!hasBrowserStorage()) return;
  localStorage.setItem(BOARD_LIST_KEY, JSON.stringify(Array.from(new Set(list.filter(Boolean)))));
}

function getInitialState(workspace: string): PersistedBoardState {
  const empty: PersistedBoardState = {
    cards: [],
    connectors: [],
    tool: 'select',
    isFocusMode: false,
    viewport: DEFAULT_VIEWPORT,
  };

  if (!hasBrowserStorage()) return empty;

  try {
    const data = localStorage.getItem(BOARD_STORAGE_KEY(workspace));
    if (!data) return empty;

    const parsed = JSON.parse(data);
    return {
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      connectors: Array.isArray(parsed.connectors) ? parsed.connectors : [],
      tool: parsed.tool === 'hand' || parsed.tool === 'connector' ? parsed.tool : 'select',
      isFocusMode: Boolean(parsed.isFocusMode),
      viewport: parsed.viewport
        ? {
            x: Number(parsed.viewport.x) || DEFAULT_VIEWPORT.x,
            y: Number(parsed.viewport.y) || DEFAULT_VIEWPORT.y,
            scale: clamp(Number(parsed.viewport.scale) || 1, MIN_SCALE, MAX_SCALE),
          }
        : DEFAULT_VIEWPORT,
    };
  } catch {
    return empty;
  }
}

function getDefaultContent(type: CardType) {
  switch (type) {
    case 'sticky':
      return {
        text: 'Write a quick note',
        backgroundColor: '#fff7b8',
        textColor: '#111827',
        fontSize: 18,
        bold: true,
        italic: false,
        align: 'left',
      };
    case 'text':
      return {
        html: '<p>Add a text block</p>',
        fontSize: 15,
        textColor: '#1f2937',
        editorBackground: 'transparent',
      };
    case 'code':
      return {
        text: 'function idea() {\n  return \"ship it\";\n}',
        language: 'javascript',
        fontSize: 13,
      };
    case 'table':
      return {
        view: 'grid',
        columns: ['Item', 'Owner', 'Status'],
        rows: [
          ['Homepage audit', 'Ari', 'Doing'],
          ['Launch copy', 'Sam', 'Review'],
          ['QA checklist', 'Taylor', 'Done'],
        ],
      };
    case 'chart':
      return {
        title: 'Weekly activity',
        chartType: 'bar',
        primaryColor: '#2563eb',
        data: [
          { name: 'Mon', value: 34 },
          { name: 'Tue', value: 48 },
          { name: 'Wed', value: 28 },
          { name: 'Thu', value: 62 },
          { name: 'Fri', value: 45 },
        ],
      };
    case 'image':
      return {
        src: '',
        caption: 'Drop in an image',
        fit: 'cover',
        opacity: 1,
      };
    case 'shape':
      return {
        label: 'Shape',
        shape: 'pill',
        fill: '#dbeafe',
        textColor: '#1e3a8a',
      };
    case 'diagram':
      return {
        title: 'Flow',
        steps: ['Input', 'Process', 'Output'],
        direction: 'horizontal',
      };
    case 'frame':
      return {
        title: 'Frame',
        subtitle: 'Group cards here',
        backgroundColor: '#ffffff',
        borderColor: '#93c5fd',
        collapsed: false,
      };
    default:
      return '';
  }
}

function getDefaultSize(type: CardType) {
  switch (type) {
    case 'sticky':
      return { width: 220, height: 190 };
    case 'text':
      return { width: 280, height: 180 };
    case 'code':
      return { width: 360, height: 240 };
    case 'table':
      return { width: 430, height: 285 };
    case 'chart':
      return { width: 320, height: 240 };
    case 'image':
      return { width: 320, height: 240 };
    case 'shape':
      return { width: 220, height: 150 };
    case 'diagram':
      return { width: 360, height: 220 };
    case 'frame':
      return { width: 760, height: 460 };
    default:
      return { width: 260, height: 180 };
  }
}

function getDefaultColor(type: CardType) {
  switch (type) {
    case 'sticky':
      return '#fff7b8';
    case 'shape':
      return '#dbeafe';
    default:
      return '#ffffff';
  }
}


const COLOR_SWATCHES = ['#ffffff', '#fff7b8', '#dcfce7', '#dbeafe', '#e0e7ff', '#fee2e2', '#f3e8ff', '#f8fafc'];

const asObjectContent = (content: any) => (content && typeof content === 'object' && !Array.isArray(content) ? content : {});

const parseNumberField = (value: string, fallback: number) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const listToText = (items: unknown[]) => items.map(item => String(item)).join('\n');

const textToList = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);

const rowsToText = (rows: unknown[]) =>
  rows
    .map(row => (Array.isArray(row) ? row.map(cell => String(cell)).join(', ') : String(row)))
    .join('\n');

const textToRows = (value: string, columnCount: number) =>
  value
    .split('\n')
    .map(row => row.split(',').map(cell => cell.trim()))
    .filter(row => row.some(Boolean))
    .map(row => {
      const next = [...row];
      while (next.length < columnCount) next.push('');
      return next.slice(0, columnCount);
    });

const numbersToText = (items: unknown[]) => items.map(item => String(Number(item) || 0)).join(', ');

const textToNumbers = (value: string) => {
  const next = value
    .split(/[\n,]+/)
    .map(item => Number(item.trim()))
    .filter(Number.isFinite);
  return next.length ? next : [0];
};

type ChartDatum = { name: string; value: number; value2?: number };

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

const getCardContentObject = (card: Card) => {
  const content = asObjectContent(card.content);
  if (Object.keys(content).length) return content;

  if (card.type === 'sticky' || card.type === 'text' || card.type === 'code') {
    return { text: String(card.content || '') };
  }

  return content;
};

const normalizeTableColumns = (content: any) =>
  Array.isArray(content.columns) && content.columns.length ? content.columns.map((column: unknown) => String(column)) : ['Item', 'Owner', 'Status'];

const normalizeTableRows = (content: any, columnCount: number) => {
  const rows = Array.isArray(content.rows) && content.rows.length ? content.rows : [['', '', '']];
  return rows.map((row: unknown) => {
    const next = Array.isArray(row) ? row.map(cell => String(cell)) : [];
    while (next.length < columnCount) next.push('');
    return next.slice(0, columnCount);
  });
};

const normalizeChartData = (data: unknown): ChartDatum[] => {
  if (Array.isArray(data) && data.length) {
    const normalized = data.map((item, index) => {
      if (typeof item === 'number') return { name: `Item ${index + 1}`, value: item };
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return {
          name: String(record.name ?? record.label ?? `Item ${index + 1}`),
          value: parseNumberField(String(record.value ?? 0), 0),
          value2: record.value2 === undefined || record.value2 === '' ? undefined : parseNumberField(String(record.value2), 0),
        };
      }
      return { name: `Item ${index + 1}`, value: parseNumberField(String(item), 0) };
    });

    return normalized.length ? normalized : [{ name: 'Item 1', value: 0 }];
  }

  return [{ name: 'Item 1', value: 0 }];
};

const chartDataToText = (data: unknown) =>
  normalizeChartData(data)
    .map(item => [item.name, item.value, item.value2].filter(value => value !== undefined).join(', '))
    .join('\n');

const textToChartData = (value: string): ChartDatum[] => {
  const rows = value
    .split('\n')
    .map(row => row.split(',').map(cell => cell.trim()))
    .filter(row => row.some(Boolean));

  return rows.length
    ? rows.map((row, index) => ({
        name: row[0] || `Item ${index + 1}`,
        value: parseNumberField(row[1] || '0', 0),
        value2: row[2] === undefined || row[2] === '' ? undefined : parseNumberField(row[2], 0),
      }))
    : [{ name: 'Item 1', value: 0 }];
};

const csvToColumns = (value: string) => value.split(',').map(column => column.trim()).filter(Boolean);


const TOOLBAR_ITEMS: Array<{ tool: Tool; label: string; icon: IconType }> = [
  { tool: 'select', label: 'Select', icon: FiMousePointer },
  { tool: 'hand', label: 'Hand', icon: FiMove },
  { tool: 'connector', label: 'Connector', icon: FiGitBranch },
];

const CARD_ITEMS: Array<{ type: CardType; label: string; icon: IconType }> = [
  { type: 'sticky', label: 'Sticky', icon: FiLayers },
  { type: 'text', label: 'Text', icon: FiType },
  { type: 'image', label: 'Image', icon: FiImage },
  { type: 'chart', label: 'Chart', icon: FiBarChart2 },
  { type: 'code', label: 'Code', icon: FiCode },
  { type: 'table', label: 'Table', icon: FiGrid },
  { type: 'shape', label: 'Shape', icon: FiSquare },
  { type: 'diagram', label: 'Diagram', icon: FiCpu },
  { type: 'frame', label: 'Frame', icon: FiBox },
];

type DataSourceModal = 'none' | 'crm' | 'planning';

const BoardPage: React.FC<BoardPageProps> = ({ workspace }) => {
  const navigate = useNavigate();
  const [boardList, setBoardList] = useState<string[]>([]);
  const [currentBoard, setCurrentBoard] = useState<string>(workspace || 'default');
  const [cards, setCards] = useState<Card[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingConnector, setPendingConnector] = useState<{ from: string | null }>({ from: null });
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [initialSelectedIds, setInitialSelectedIds] = useState<string[]>([]);

  // Custom board modals state
  const [boardModalType, setBoardModalType] = useState<'create' | 'rename' | 'delete' | 'none'>('none');
  const [boardModalValue, setBoardModalValue] = useState('');

  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [mouseBoardPos, setMouseBoardPos] = useState({ x: 0, y: 0 });
  const [showToolsPanel, setShowToolsPanel] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Data source modal state
  const [dataSourceModal, setDataSourceModal] = useState<DataSourceModal>('none');
  const [crmLeads, setCrmLeads] = useState<Lead[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmSelectedIds, setCrmSelectedIds] = useState<Set<string>>(new Set());
  const [planningFiles, setPlanningFiles] = useState<PlanningItem[]>([]);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningSelectedPaths, setPlanningSelectedPaths] = useState<Set<string>>(new Set());
  const [planningImporting, setPlanningImporting] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    viewport: Viewport;
  }>({ active: false, pointerId: null, startX: 0, startY: 0, viewport: DEFAULT_VIEWPORT });

  // Undo / Redo history
  const MAX_HISTORY = 50;
  const historyRef = useRef<{ past: Array<{cards: Card[], connectors: Connector[]}>, future: Array<{cards: Card[], connectors: Connector[]}> }>({ past: [], future: [] });
  const isUndoRedoRef = useRef(false);
  const lastSnapshotRef = useRef('');

  // Load board list and current board state from server
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    
    const loadBoardsAndState = async () => {
      try {
        const list = await getBoards();
        if (!active) return;
        setBoardList(list);

        const state = await getBoardState(workspace || 'default');
        if (!active) return;
        setCards(state.cards || []);
        setConnectors(state.connectors || []);
        setTool(state.tool || 'select');
        setIsFocusMode(!!state.isFocusMode);
        setViewport(state.viewport || DEFAULT_VIEWPORT);
        setCurrentBoard(workspace || 'default');
      } catch (err) {
        console.error('Failed to load board data:', err);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    loadBoardsAndState();

    return () => {
      active = false;
    };
  }, [workspace]);

  // Debounced auto-save to backend + immediate local storage fallback
  useEffect(() => {
    if (isLoading) return;

    const state: PersistedBoardState = {
      cards,
      connectors,
      tool,
      isFocusMode,
      viewport,
    };

    // Save locally immediately
    if (hasBrowserStorage()) {
      localStorage.setItem(BOARD_STORAGE_KEY(currentBoard), JSON.stringify(state));
    }

    // Debounce save to server
    const timer = setTimeout(() => {
      updateBoardState(currentBoard, state).catch(err => {
        console.error('Failed to auto-save board state to backend:', err);
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [cards, connectors, currentBoard, isFocusMode, tool, viewport, isLoading]);

  // Track board state history for undo/redo
  useEffect(() => {
    if (isLoading) return;
    if (isUndoRedoRef.current) { isUndoRedoRef.current = false; return; }
    const snapshot = JSON.stringify({ cards, connectors });
    if (snapshot === lastSnapshotRef.current) return;
    if (lastSnapshotRef.current) {
      historyRef.current.past.push(JSON.parse(lastSnapshotRef.current));
      if (historyRef.current.past.length > MAX_HISTORY) historyRef.current.past.shift();
      historyRef.current.future = [];
    }
    lastSnapshotRef.current = snapshot;
  }, [cards, connectors, isLoading]);

  const undo = () => {
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    const previous = past.pop()!;
    future.push(JSON.parse(lastSnapshotRef.current));
    isUndoRedoRef.current = true;
    lastSnapshotRef.current = JSON.stringify(previous);
    setCards(previous.cards);
    setConnectors(previous.connectors);
  };

  const redo = () => {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const next = future.pop()!;
    past.push(JSON.parse(lastSnapshotRef.current));
    isUndoRedoRef.current = true;
    lastSnapshotRef.current = JSON.stringify(next);
    setCards(next.cards);
    setConnectors(next.connectors);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'));
      if (isEditing) return;

      // Undo: Ctrl+Z
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      // Redo: Ctrl+Shift+Z
      if ((event.ctrlKey || event.metaKey) && (event.key === 'Z' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (selectedCardIds.length > 0 || selectedCardId) {
        event.preventDefault();
        deleteSelectedCards();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCardId, selectedCardIds, cards]);

  const screenToBoard = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    return {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - viewport.y) / viewport.scale,
    };
  };

  const zoomAt = (clientX: number, clientY: number, nextScale: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const boardPoint = {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - viewport.y) / viewport.scale,
    };

    setViewport({
      scale,
      x: clientX - rect.left - boardPoint.x * scale,
      y: clientY - rect.top - boardPoint.y * scale,
    });
  };

  const zoomFromControls = (direction: 'in' | 'out') => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = direction === 'in' ? 1.14 : 0.86;
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, viewport.scale * factor);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    zoomAt(event.clientX, event.clientY, viewport.scale * factor);
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const clickedCard = target.closest('.board-card, .board-frame');
    const shouldPan = tool === 'hand' || event.button === 1 || event.altKey;

    const boardPos = screenToBoard(event.clientX, event.clientY);
    setMouseBoardPos(boardPos);

    if (clickedCard) return;

    if (pendingConnector.from) {
      setPendingConnector({ from: null });
    }

    if (!shouldPan && tool === 'select') {
      setSelectionBox({
        startX: boardPos.x,
        startY: boardPos.y,
        endX: boardPos.x,
        endY: boardPos.y,
      });
      setInitialSelectedIds(event.shiftKey ? [...selectedCardIds] : []);
      if (!event.shiftKey) {
        setSelectedCardIds([]);
        setSelectedCardId(null);
      }
      setSelectedConnectorId(null);

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (!shouldPan) {
      setSelectedCardId(null);
      setSelectedCardIds([]);
      setSelectedConnectorId(null);
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewport,
    };
    setIsPanning(true);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const boardPos = screenToBoard(event.clientX, event.clientY);
    setMouseBoardPos(boardPos);

    if (selectionBox) {
      setSelectionBox(prev => prev ? { ...prev, endX: boardPos.x, endY: boardPos.y } : null);

      const x1 = Math.min(selectionBox.startX, boardPos.x);
      const y1 = Math.min(selectionBox.startY, boardPos.y);
      const x2 = Math.max(selectionBox.startX, boardPos.x);
      const y2 = Math.max(selectionBox.startY, boardPos.y);

      const intersectingCardIds = cards
        .filter(card => {
          const cardLeft = card.x;
          const cardRight = card.x + card.width;
          const cardTop = card.y;
          const cardBottom = card.y + card.height;

          return !(cardRight < x1 || cardLeft > x2 || cardBottom < y1 || cardTop > y2);
        })
        .map(card => card.id);

      const nextSelection = Array.from(new Set([...initialSelectedIds, ...intersectingCardIds]));
      setSelectedCardIds(nextSelection);
      setSelectedCardId(nextSelection[nextSelection.length - 1] || null);
      return;
    }

    if (!panRef.current.active) return;

    const dx = event.clientX - panRef.current.startX;
    const dy = event.clientY - panRef.current.startY;
    setViewport({
      ...panRef.current.viewport,
      x: panRef.current.viewport.x + dx,
      y: panRef.current.viewport.y + dy,
    });
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (selectionBox) {
      setSelectionBox(null);
      setInitialSelectedIds([]);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (panRef.current.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panRef.current.active = false;
    panRef.current.pointerId = null;
    setIsPanning(false);
  };

  const switchBoard = (name: string) => {
    navigate(`/board/${encodeURIComponent(name)}`);
  };

  const addCard = (type: CardType, bulkCount = 1) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToBoard(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : { x: 260, y: 180 };

    const newCards = Array.from({ length: bulkCount }, (_, index) => {
      const size = getDefaultSize(type);
      const offset = index * 34;

      return {
        id: uniqueId(type),
        type,
        x: Math.round(center.x - size.width / 2 + offset),
        y: Math.round(center.y - size.height / 2 + offset),
        width: size.width,
        height: size.height,
        content: getDefaultContent(type),
        color: getDefaultColor(type),
        rotation: 0,
        orientation: size.width >= size.height ? 'landscape' : 'portrait',
      } satisfies Card;
    });

    setCards(current => [...current, ...newCards]);
    setSelectedCardId(newCards[0]?.id ?? null);
    setSelectedConnectorId(null);
    setTool('select');
  };

  const updateCard = (id: string, patch: Partial<Card>) => {
    setCards(current => current.map(card => (card.id === id ? { ...card, ...patch } : card)));
  };

  const updateCardContent = (id: string, content: any) => {
    updateCard(id, { content });
  };

  const deleteCard = (id: string) => {
    const idsToDelete = new Set(cards.filter(card => card.id === id || card.parentId === id).map(card => card.id));

    setCards(current => current.filter(card => !idsToDelete.has(card.id)));
    setConnectors(current =>
      current.filter(connector => !idsToDelete.has(connector.from) && !idsToDelete.has(connector.to)),
    );
    setSelectedCardId(current => (current && idsToDelete.has(current) ? null : current));
    setSelectedCardIds(current => current.filter(cid => !idsToDelete.has(cid)));
    setSelectedConnectorId(current => {
      if (!current) return null;
      const connector = connectors.find(item => item.id === current);
      return connector && (idsToDelete.has(connector.from) || idsToDelete.has(connector.to)) ? null : current;
    });
    setPendingConnector(current => (current.from && idsToDelete.has(current.from) ? { from: null } : current));
  };

  const deleteSelectedCards = () => {
    const ids = selectedCardIds.length > 0 ? selectedCardIds : (selectedCardId ? [selectedCardId] : []);
    if (ids.length === 0) return;

    const idsToDelete = new Set<string>();
    ids.forEach(id => {
      idsToDelete.add(id);
      cards.filter(card => card.parentId === id).forEach(child => idsToDelete.add(child.id));
    });

    setCards(current => current.filter(card => !idsToDelete.has(card.id)));
    setConnectors(current =>
      current.filter(connector => !idsToDelete.has(connector.from) && !idsToDelete.has(connector.to)),
    );
    setSelectedCardIds([]);
    setSelectedCardId(null);
    setSelectedConnectorId(null);
    setPendingConnector({ from: null });
  };

  const getFrameParentId = (candidate: Card, allCards: Card[]) => {
    if (candidate.type === 'frame') return undefined;

    const centerX = candidate.x + candidate.width / 2;
    const centerY = candidate.y + candidate.height / 2;

    const frame = allCards
      .filter(card => card.type === 'frame')
      .sort((a, b) => a.width * a.height - b.width * b.height)
      .find(card => {
        return (
          centerX >= card.x &&
          centerX <= card.x + card.width &&
          centerY >= card.y &&
          centerY <= card.y + card.height
        );
      });

    return frame?.id;
  };

  const moveCard = (id: string, x: number, y: number) => {
    setCards(current => {
      const movingCard = current.find(card => card.id === id);
      if (!movingCard) return current;

      const dx = x - movingCard.x;
      const dy = y - movingCard.y;

      const idsToMove = selectedCardIds.includes(id) ? selectedCardIds : [id];
      const idsToMoveSet = new Set(idsToMove);

      const next = current.map(card => {
        if (idsToMoveSet.has(card.id)) {
          return { ...card, x: card.x + dx, y: card.y + dy };
        }
        if (card.parentId && idsToMoveSet.has(card.parentId) && !idsToMoveSet.has(card.id)) {
          return { ...card, x: card.x + dx, y: card.y + dy };
        }
        return card;
      });

      return next.map(card => {
        if (!idsToMoveSet.has(card.id) || card.type === 'frame') return card;
        return { ...card, parentId: getFrameParentId(card, next) };
      });
    });
  };

  const resizeCard = (id: string, width: number, height: number) => {
    setCards(current =>
      current.map(card =>
        card.id === id
          ? {
              ...card,
              width: Math.round(Math.max(120, width)),
              height: Math.round(Math.max(90, height)),
            }
          : card,
      ),
    );
  };

  const startConnector = (from: string) => {
    setPendingConnector({ from });
    setSelectedCardId(from);
    setSelectedConnectorId(null);
    setTool('connector');
  };

  const finishConnector = (to: string) => {
    setPendingConnector(current => {
      if (!current.from || current.from === to) return { from: null };

      setConnectors(existing => {
        const alreadyExists = existing.some(
          connector =>
            (connector.from === current.from && connector.to === to) ||
            (connector.from === to && connector.to === current.from),
        );

        if (alreadyExists) return existing;

        return [...existing, { id: uniqueId('conn'), from: current.from!, to, color: '#64748b', strokeWidth: 2.5, dashed: false }];
      });

      return { from: null };
    });
  };

  const deleteConnector = (id: string) => {
    setConnectors(current => current.filter(connector => connector.id !== id));
    setSelectedConnectorId(current => (current === id ? null : current));
  };

  const updateConnector = (id: string, patch: Partial<Connector>) => {
    setConnectors(current => current.map(connector => (connector.id === id ? { ...connector, ...patch } : connector)));
  };

  const selectCard = (id: string | null, shiftKey = false) => {
    setSelectedConnectorId(null);
    if (!id) {
      setSelectedCardIds([]);
      setSelectedCardId(null);
      return;
    }

    setSelectedCardIds(prev => {
      if (shiftKey) {
        const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
        setSelectedCardId(next[next.length - 1] || null);
        return next;
      } else {
        if (prev.includes(id)) {
          return prev;
        }
        setSelectedCardId(id);
        return [id];
      }
    });
  };

  const selectConnector = (id: string) => {
    setSelectedConnectorId(id);
    setSelectedCardId(null);
    setPendingConnector({ from: null });
  };

  const duplicateCard = (id: string) => {
    const source = cards.find(card => card.id === id);
    if (!source) return;

    const copy: Card = {
      ...source,
      id: uniqueId(`${source.type}-copy`),
      x: source.x + 36,
      y: source.y + 36,
      parentId: undefined,
      content: typeof source.content === 'object' && source.content ? JSON.parse(JSON.stringify(source.content)) : source.content,
    };

    setCards(current => [...current, copy]);
    setSelectedCardId(copy.id);
    setSelectedConnectorId(null);
    setTool('select');
  };

  const fitToContent = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (cards.length === 0) {
      setViewport(DEFAULT_VIEWPORT);
      return;
    }

    const padding = 120;
    const minX = Math.min(...cards.map(card => card.x));
    const minY = Math.min(...cards.map(card => card.y));
    const maxX = Math.max(...cards.map(card => card.x + card.width));
    const maxY = Math.max(...cards.map(card => card.y + card.height));
    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;
    const availableWidth = Math.max(320, rect.width - 260);
    const availableHeight = Math.max(240, rect.height - 160);
    const scale = clamp(Math.min(availableWidth / contentWidth, availableHeight / contentHeight, 1.2), MIN_SCALE, MAX_SCALE);

    setViewport({
      scale,
      x: rect.width / 2 - (minX + (maxX - minX) / 2) * scale,
      y: rect.height / 2 - (minY + (maxY - minY) / 2) * scale,
    });
  };

  const triggerStickyCapture = () => {
    setIsScanning(true);

    window.setTimeout(() => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToBoard(rect.left + rect.width / 2, rect.top + rect.height / 2)
        : { x: 400, y: 250 };

      const captured: Card[] = ['Customer quote', 'Campaign idea', 'Follow up'].map((text, index) => ({
        id: uniqueId('captured-sticky'),
        type: 'sticky',
        x: Math.round(center.x - 280 + index * 210),
        y: Math.round(center.y - 90 + (index % 2) * 26),
        width: 190,
        height: 160,
        content: text,
        color: ['#fff7b8', '#dcfce7', '#e0e7ff'][index],
      }));

      setCards(current => [...current, ...captured]);
      setSelectedCardId(captured[0].id);
      setIsScanning(false);
    }, 850);
  };

  const handleCreateBoard = () => {
    setBoardModalType('create');
    setBoardModalValue('');
  };

  const handleRenameBoard = () => {
    if (currentBoard === 'default') return;
    setBoardModalType('rename');
    setBoardModalValue(currentBoard);
  };

  const handleDeleteBoard = () => {
    if (currentBoard === 'default') return;
    setBoardModalType('delete');
  };

  const submitBoardModal = async () => {
    const trimmed = boardModalValue.trim();
    if (boardModalType !== 'delete' && !trimmed) return;

    if (boardModalType === 'create') {
      if (boardList.includes(trimmed)) {
        alert('A board with that name already exists.');
        return;
      }
      try {
        const emptyState = {
          cards: [],
          connectors: [],
          tool: 'select',
          isFocusMode: false,
          viewport: DEFAULT_VIEWPORT,
        };
        await updateBoardState(trimmed, emptyState);
        setBoardList(list => [...list, trimmed]);
        setBoardModalType('none');
        switchBoard(trimmed);
      } catch (err) {
        console.error('Failed to create board:', err);
        alert('Failed to create board on the server.');
      }
    } else if (boardModalType === 'rename') {
      if (trimmed === currentBoard) {
        setBoardModalType('none');
        return;
      }
      if (boardList.includes(trimmed)) {
        alert('A board with that name already exists.');
        return;
      }
      try {
        await renameBoard(currentBoard, trimmed);
        setBoardList(list => list.map(b => (b === currentBoard ? trimmed : b)));
        setBoardModalType('none');
        switchBoard(trimmed);
      } catch (err) {
        console.error('Failed to rename board:', err);
        alert('Failed to rename board on the server.');
      }
    } else if (boardModalType === 'delete') {
      try {
        await deleteBoard(currentBoard);
        const nextBoard = boardList.find(board => board !== currentBoard) || 'default';
        setBoardList(list => list.filter(board => board !== currentBoard));
        setBoardModalType('none');
        switchBoard(nextBoard);
      } catch (err) {
        console.error('Failed to delete board:', err);
        alert('Failed to delete board on the server.');
      }
    }
  };

  // ── Data source handlers ──────────────────────────────────────────────

  const openCrmModal = async () => {
    setDataSourceModal('crm');
    setCrmSelectedIds(new Set());
    setCrmLoading(true);
    try {
      const leads = await dbGetLeads();
      setCrmLeads(leads);
    } catch (err) {
      console.error('Failed to load CRM leads:', err);
    } finally {
      setCrmLoading(false);
    }
  };

  const openPlanningModal = async () => {
    setDataSourceModal('planning');
    setPlanningSelectedPaths(new Set());
    setPlanningLoading(true);
    try {
      const files = await getPlanningFiles('');
      setPlanningFiles(files.filter(f => f.type === 'file'));
    } catch (err) {
      console.error('Failed to load planning files:', err);
    } finally {
      setPlanningLoading(false);
    }
  };

  const toggleCrmLead = (id: string) => {
    setCrmSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const togglePlanningFile = (path: string) => {
    setPlanningSelectedPaths(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const importCrmLeads = () => {
    if (crmSelectedIds.size === 0) return;
    const selected = crmLeads.filter(l => crmSelectedIds.has(l.id));
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToBoard(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : { x: 300, y: 200 };

    // Group into a table card
    const newCard: Card = {
      id: uniqueId('crm-import'),
      type: 'table',
      x: Math.round(center.x - 280),
      y: Math.round(center.y - 120),
      width: 620,
      height: 300,
      content: {
        view: 'grid',
        columns: ['Full Name', 'Age', 'Gender', 'Email', 'Contact', 'Address'],
        rows: selected.map(l => [
          l.name,
          l.age ? String(l.age) : '',
          l.gender || '',
          l.email || '',
          l.phone || '',
          l.address || '',
        ]),
      },
      color: '#ffffff',
    };
    setCards(prev => [...prev, newCard]);
    setSelectedCardId(newCard.id);
    setDataSourceModal('none');
    setCrmSelectedIds(new Set());
  };

  const importPlanningFiles = async () => {
    if (planningSelectedPaths.size === 0) return;
    setPlanningImporting(true);
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToBoard(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : { x: 300, y: 200 };

    const newCards: Card[] = [];
    let colOffset = 0;
    for (const filePath of Array.from(planningSelectedPaths)) {
      try {
        const result = await getPlanningFileContent(filePath);
        const fileName = filePath.split('/').pop() || filePath;
        const rawText = result.content ||
          (result.html ? result.html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() : '') ||
          '';
        const preview = rawText.slice(0, 800);

        newCards.push({
          id: uniqueId('planning-import'),
          type: 'sticky',
          x: Math.round(center.x - 200 + colOffset * 260),
          y: Math.round(center.y - 120),
          width: 240,
          height: 220,
          content: {
            text: `📄 ${fileName}\n\n${preview}`,
            backgroundColor: '#e0e7ff',
            textColor: '#1e1b4b',
            fontSize: 12,
            bold: false,
            italic: false,
            align: 'left',
          },
          color: '#e0e7ff',
        });
        colOffset++;
      } catch (err) {
        console.error(`Failed to load planning file ${filePath}:`, err);
      }
    }

    setCards(prev => [...prev, ...newCards]);
    if (newCards.length > 0) setSelectedCardId(newCards[0].id);
    setPlanningImporting(false);
    setDataSourceModal('none');
    setPlanningSelectedPaths(new Set());
  };

  // ─────────────────────────────────────────────────────────────────────────

  const nonFrameCards = cards.filter(card => card.type !== 'frame');
  const frameCards = cards.filter(card => card.type === 'frame');

  const panelClass = isFocusMode
    ? 'border-4 border-white bg-slate-950 text-slate-50 shadow-[4px_4px_0px_0px_white]'
    : 'border-4 border-black bg-white text-black neo-shadow-sm';

  const toolButtonClass = (active = false) =>
    cn(
      'group flex h-10 w-full items-center gap-2 border-2 border-black px-2 text-left text-[12px] font-black uppercase tracking-wider transition hover:-translate-y-0.5 active:translate-y-0',
      isFocusMode
        ? 'border-white bg-slate-800 text-slate-200 hover:bg-slate-800'
        : 'border-black bg-white text-black hover:bg-neo-bg',
      active && (isFocusMode ? 'bg-white text-slate-950' : 'bg-neo-secondary text-black'),
    );

  const footerButtonClass = cn(
    'inline-flex h-9 items-center justify-center gap-2 border-2 border-black px-3 text-xs font-black uppercase transition hover:-translate-y-0.5 active:translate-y-0',
    isFocusMode
      ? 'border-white bg-slate-800 text-slate-100 hover:bg-slate-700'
      : 'border-black bg-white text-black hover:bg-neo-bg neo-btn-active',
  );

  const selectedCard = selectedCardId ? cards.find(card => card.id === selectedCardId) : undefined;
  const selectedConnector = selectedConnectorId ? connectors.find(connector => connector.id === selectedConnectorId) : undefined;

  const settingsInputClass = cn(
    'h-9 w-full border-2 border-black px-3 text-xs font-bold uppercase tracking-wider outline-none transition focus:bg-neo-bg',
    isFocusMode ? 'border-white bg-slate-800 text-slate-100' : 'border-black bg-white text-black',
  );
  const settingsTextareaClass = cn(
    'min-h-[92px] w-full resize-y border-2 border-black px-3 py-2 text-xs font-bold uppercase tracking-wider leading-relaxed outline-none transition focus:bg-neo-bg',
    isFocusMode ? 'border-white bg-slate-800 text-slate-100 placeholder:text-slate-500' : 'border-black bg-white text-black placeholder:text-black/45',
  );
  const settingsLabelClass = cn('grid gap-1.5 text-[10px] font-black uppercase tracking-wider', isFocusMode ? 'text-slate-300' : 'text-black');
  const settingsSectionClass = cn('border-2 border-black p-3', isFocusMode ? 'border-white bg-slate-900' : 'border-black bg-[#FFFDF5]');

  const patchSelectedCardContent = (patch: Record<string, unknown>) => {
    if (!selectedCard) return;
    updateCardContent(selectedCard.id, { ...getCardContentObject(selectedCard), ...patch });
  };

  const setSelectedCardOrientation = (orientation: 'portrait' | 'landscape') => {
    if (!selectedCard) return;
    const shouldSwap =
      (orientation === 'portrait' && selectedCard.width > selectedCard.height) ||
      (orientation === 'landscape' && selectedCard.height > selectedCard.width);

    updateCard(selectedCard.id, {
      orientation,
      width: shouldSwap ? selectedCard.height : selectedCard.width,
      height: shouldSwap ? selectedCard.width : selectedCard.height,
    });
  };

  const renderColorSwatches = (selected: string, onChange: (color: string) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_SWATCHES.map(color => (
        <button
          key={color}
          type="button"
          className={cn('h-7 w-7 border-2 border-black transition hover:scale-105', selected === color ? 'ring-2 ring-offset-1 ring-black' : '')}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          aria-label={`Set color ${color}`}
        />
      ))}
    </div>
  );

  const renderCommonCardSettings = () => {
    if (!selectedCard) return null;
    const content = getCardContentObject(selectedCard);

    return (
      <div className={settingsSectionClass}>
        <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Layout</p>
        <div className="grid grid-cols-2 gap-2">
          <label className={settingsLabelClass}>
            X
            <input className={settingsInputClass} type="number" value={selectedCard.x} onChange={event => updateCard(selectedCard.id, { x: parseNumberField(event.target.value, selectedCard.x) })} />
          </label>
          <label className={settingsLabelClass}>
            Y
            <input className={settingsInputClass} type="number" value={selectedCard.y} onChange={event => updateCard(selectedCard.id, { y: parseNumberField(event.target.value, selectedCard.y) })} />
          </label>
          <label className={settingsLabelClass}>
            Width
            <input className={settingsInputClass} type="number" min={120} value={selectedCard.width} onChange={event => updateCard(selectedCard.id, { width: Math.max(120, parseNumberField(event.target.value, selectedCard.width)) })} />
          </label>
          <label className={settingsLabelClass}>
            Height
            <input className={settingsInputClass} type="number" min={90} value={selectedCard.height} onChange={event => updateCard(selectedCard.id, { height: Math.max(90, parseNumberField(event.target.value, selectedCard.height)) })} />
          </label>
        </div>
        <div className="mt-3 grid gap-2">
          <label className={settingsLabelClass}>
            Orientation
            <select className={settingsInputClass} value={selectedCard.orientation || (selectedCard.width >= selectedCard.height ? 'landscape' : 'portrait')} onChange={event => setSelectedCardOrientation(event.target.value as 'portrait' | 'landscape')}>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <label className={settingsLabelClass}>
            Rotation {Math.round(Number(selectedCard.rotation || 0))}°
            <input className="w-full accent-blue-600" type="range" min={-180} max={180} value={selectedCard.rotation || 0} onChange={event => updateCard(selectedCard.id, { rotation: parseNumberField(event.target.value, 0) })} />
          </label>
          <label className={settingsLabelClass}>
            Card color
            <input className={settingsInputClass} type="color" value={selectedCard.color || '#ffffff'} onChange={event => updateCard(selectedCard.id, { color: event.target.value })} />
          </label>
          {renderColorSwatches(selectedCard.color || '#ffffff', color => updateCard(selectedCard.id, { color }))}
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <input type="checkbox" checked={content.showChrome !== false} onChange={event => patchSelectedCardContent({ showChrome: event.target.checked })} />
            Show card toolbar
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className={footerButtonClass} onClick={() => duplicateCard(selectedCard.id)}>Duplicate</button>
          <button type="button" className={footerButtonClass} onClick={() => deleteCard(selectedCard.id)}>Delete</button>
        </div>
      </div>
    );
  };

  const renderTypeSpecificSettings = () => {
    if (!selectedCard) return null;
    const content = getCardContentObject(selectedCard);

    if (selectedCard.type === 'sticky') {
      return (
        <div className={settingsSectionClass}>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Sticky note</p>
          <label className={settingsLabelClass}>
            Note text
            <textarea className={settingsTextareaClass} value={String(content.text ?? '')} onChange={event => patchSelectedCardContent({ text: event.target.value })} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className={settingsLabelClass}>
              Background
              <input className={settingsInputClass} type="color" value={String(content.backgroundColor || selectedCard.color || '#fff7b8')} onChange={event => patchSelectedCardContent({ backgroundColor: event.target.value })} />
            </label>
            <label className={settingsLabelClass}>
              Text color
              <input className={settingsInputClass} type="color" value={String(content.textColor || '#111827')} onChange={event => patchSelectedCardContent({ textColor: event.target.value })} />
            </label>
            <label className={settingsLabelClass}>
              Text size
              <input className={settingsInputClass} type="number" min={10} max={72} value={Number(content.fontSize || 18)} onChange={event => patchSelectedCardContent({ fontSize: parseNumberField(event.target.value, 18) })} />
            </label>
            <label className={settingsLabelClass}>
              Align
              <select className={settingsInputClass} value={String(content.align || 'left')} onChange={event => patchSelectedCardContent({ align: event.target.value })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-[10px] text-slate-400 font-medium">Supports markdown: **bold** *italic* # heading - list `code`</p>
        </div>
      );
    }

    if (selectedCard.type === 'text') {
      const html = String(content.html ?? `<p>${stripHtml(String(content.text || '')) || 'Add a text block'}</p>`);
      return (
        <div className={settingsSectionClass}>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Rich text</p>
          <label className={settingsLabelClass}>
            HTML content
            <textarea className={settingsTextareaClass} value={html} onChange={event => patchSelectedCardContent({ html: event.target.value })} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className={settingsLabelClass}>
              Text size
              <input className={settingsInputClass} type="number" min={10} max={64} value={Number(content.fontSize || 15)} onChange={event => patchSelectedCardContent({ fontSize: parseNumberField(event.target.value, 15) })} />
            </label>
            <label className={settingsLabelClass}>
              Text color
              <input className={settingsInputClass} type="color" value={String(content.textColor || '#1f2937')} onChange={event => patchSelectedCardContent({ textColor: event.target.value })} />
            </label>
            <label className={settingsLabelClass}>
              Editor background
              <input className={settingsInputClass} type="color" value={String(content.editorBackground === 'transparent' ? '#ffffff' : content.editorBackground || '#ffffff')} onChange={event => patchSelectedCardContent({ editorBackground: event.target.value })} />
            </label>
          </div>
        </div>
      );
    }

    if (selectedCard.type === 'chart') {
      return (
        <div className={settingsSectionClass}>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Chart</p>
          <label className={settingsLabelClass}>
            Title
            <input className={settingsInputClass} value={String(content.title || '')} onChange={event => patchSelectedCardContent({ title: event.target.value })} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className={settingsLabelClass}>
              Type
              <select className={settingsInputClass} value={String(content.chartType || 'bar')} onChange={event => patchSelectedCardContent({ chartType: event.target.value })}>
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="area">Area</option>
                <option value="pie">Pie</option>
                <option value="scatter">Scatter</option>
                <option value="radar">Radar</option>
              </select>
            </label>
            <label className={settingsLabelClass}>
              Main color
              <input className={settingsInputClass} type="color" value={String(content.primaryColor || '#2563eb')} onChange={event => patchSelectedCardContent({ primaryColor: event.target.value })} />
            </label>
          </div>
          <label className={cn(settingsLabelClass, 'mt-3')}>
            Data entries, one per line: label, value
            <textarea className={settingsTextareaClass} value={chartDataToText(content.data)} onChange={event => patchSelectedCardContent({ data: textToChartData(event.target.value) })} />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
            <input type="checkbox" checked={Boolean(content.donut)} onChange={event => patchSelectedCardContent({ donut: event.target.checked })} />
            Donut style for pie charts
          </label>
        </div>
      );
    }

    if (selectedCard.type === 'table') {
      const columns = normalizeTableColumns(content);
      const rows = normalizeTableRows(content, columns.length);
      return (
        <div className={settingsSectionClass}>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Table</p>
          <label className={settingsLabelClass}>
            View
            <select className={settingsInputClass} value={String(content.view || 'grid')} onChange={event => patchSelectedCardContent({ view: event.target.value })}>
              <option value="grid">Grid</option>
              <option value="kanban">Kanban</option>
              <option value="timeline">Timeline</option>
            </select>
          </label>
          <label className={cn(settingsLabelClass, 'mt-3')}>
            Columns, comma separated
            <input
              className={settingsInputClass}
              value={columns.join(', ')}
              onChange={event => {
                const nextColumns = csvToColumns(event.target.value);
                if (!nextColumns.length) return;
                const nextRows = rows.map((row: any) => {
                  const next = [...row];
                  while (next.length < nextColumns.length) next.push('');
                  return next.slice(0, nextColumns.length);
                });
                patchSelectedCardContent({ columns: nextColumns, rows: nextRows });
              }}
            />
          </label>
          <label className={cn(settingsLabelClass, 'mt-3')}>
            Rows, one CSV row per line
            <textarea className={settingsTextareaClass} value={rowsToText(rows)} onChange={event => patchSelectedCardContent({ rows: textToRows(event.target.value, columns.length) })} />
          </label>
        </div>
      );
    }

    if (selectedCard.type === 'image') {
      return (
        <div className={settingsSectionClass}>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Image</p>
          <label className={settingsLabelClass}>
            Image URL
            <input className={settingsInputClass} value={String(content.src || '')} onChange={event => patchSelectedCardContent({ src: event.target.value })} />
          </label>
          <label className={cn(settingsLabelClass, 'mt-3')}>
            Caption
            <input className={settingsInputClass} value={String(content.caption || '')} onChange={event => patchSelectedCardContent({ caption: event.target.value })} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className={settingsLabelClass}>
              Fit
              <select className={settingsInputClass} value={String(content.fit || 'cover')} onChange={event => patchSelectedCardContent({ fit: event.target.value })}>
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="fill">Fill</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className={settingsLabelClass}>
              Opacity
              <input className={settingsInputClass} type="number" min={0.1} max={1} step={0.1} value={Number(content.opacity || 1)} onChange={event => patchSelectedCardContent({ opacity: parseNumberField(event.target.value, 1) })} />
            </label>
          </div>
        </div>
      );
    }

    if (selectedCard.type === 'shape') {
      return (
        <div className={settingsSectionClass}>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Shape</p>
          <label className={settingsLabelClass}>
            Label
            <input className={settingsInputClass} value={String(content.label || '')} onChange={event => patchSelectedCardContent({ label: event.target.value })} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className={settingsLabelClass}>
              Shape
              <select className={settingsInputClass} value={String(content.shape || 'pill')} onChange={event => patchSelectedCardContent({ shape: event.target.value })}>
                <option value="pill">Pill</option>
                <option value="rectangle">Rectangle</option>
                <option value="circle">Circle</option>
                <option value="diamond">Diamond</option>
              </select>
            </label>
            <label className={settingsLabelClass}>
              Fill
              <input className={settingsInputClass} type="color" value={String(content.fill || '#dbeafe')} onChange={event => patchSelectedCardContent({ fill: event.target.value })} />
            </label>
            <label className={settingsLabelClass}>
              Text color
              <input className={settingsInputClass} type="color" value={String(content.textColor || '#1e3a8a')} onChange={event => patchSelectedCardContent({ textColor: event.target.value })} />
            </label>
          </div>
        </div>
      );
    }

    if (selectedCard.type === 'diagram') {
      const steps = Array.isArray(content.steps) ? content.steps : ['Input', 'Process', 'Output'];
      return (
        <div className={settingsSectionClass}>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Diagram</p>
          <label className={settingsLabelClass}>
            Title
            <input className={settingsInputClass} value={String(content.title || '')} onChange={event => patchSelectedCardContent({ title: event.target.value })} />
          </label>
          <label className={cn(settingsLabelClass, 'mt-3')}>
            Direction
            <select className={settingsInputClass} value={String(content.direction || 'horizontal')} onChange={event => patchSelectedCardContent({ direction: event.target.value })}>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </label>
          <label className={cn(settingsLabelClass, 'mt-3')}>
            Steps, one per line
            <textarea className={settingsTextareaClass} value={listToText(steps)} onChange={event => patchSelectedCardContent({ steps: textToList(event.target.value) })} />
          </label>
        </div>
      );
    }

    if (selectedCard.type === 'frame') {
      return (
        <div className={settingsSectionClass}>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Frame</p>
          <label className={settingsLabelClass}>
            Title
            <input className={settingsInputClass} value={String(content.title || '')} onChange={event => patchSelectedCardContent({ title: event.target.value })} />
          </label>
          <label className={cn(settingsLabelClass, 'mt-3')}>
            Subtitle
            <input className={settingsInputClass} value={String(content.subtitle || '')} onChange={event => patchSelectedCardContent({ subtitle: event.target.value })} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className={settingsLabelClass}>
              Background
              <input className={settingsInputClass} type="color" value={String(content.backgroundColor || '#ffffff')} onChange={event => patchSelectedCardContent({ backgroundColor: event.target.value })} />
            </label>
            <label className={settingsLabelClass}>
              Border
              <input className={settingsInputClass} type="color" value={String(content.borderColor || '#93c5fd')} onChange={event => patchSelectedCardContent({ borderColor: event.target.value })} />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
            <input type="checkbox" checked={Boolean(content.collapsed)} onChange={event => patchSelectedCardContent({ collapsed: event.target.checked })} />
            Collapse frame content
          </label>
        </div>
      );
    }

    if (selectedCard.type === 'code') {
      return (
        <div className={settingsSectionClass}>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Code</p>
          <label className={settingsLabelClass}>
            Language
            <input className={settingsInputClass} value={String(content.language || 'javascript')} onChange={event => patchSelectedCardContent({ language: event.target.value })} />
          </label>
          <label className={cn(settingsLabelClass, 'mt-3')}>
            Font size
            <input className={settingsInputClass} type="number" min={10} max={28} value={Number(content.fontSize || 13)} onChange={event => patchSelectedCardContent({ fontSize: parseNumberField(event.target.value, 13) })} />
          </label>
          <label className={cn(settingsLabelClass, 'mt-3')}>
            Code
            <textarea className={settingsTextareaClass} value={String(content.text || '')} onChange={event => patchSelectedCardContent({ text: event.target.value })} />
          </label>
        </div>
      );
    }

    return null;
  };

  const renderSettingsPanel = () => {
    if (selectedConnector) {
      return (
        <aside className={cn('sticky top-6 max-h-[calc(100vh-3rem)] overflow-auto rounded-xl border p-4 shadow-2xl backdrop-blur-xl', panelClass)} aria-label="Connector settings">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Connector settings</p>
          <div className="mt-4 space-y-3">
            <div className={settingsSectionClass}>
              <label className={settingsLabelClass}>
                Label
                <input className={settingsInputClass} value={selectedConnector.label || ''} onChange={event => updateConnector(selectedConnector.id, { label: event.target.value })} />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className={settingsLabelClass}>
                  Color
                  <input className={settingsInputClass} type="color" value={selectedConnector.color || '#64748b'} onChange={event => updateConnector(selectedConnector.id, { color: event.target.value })} />
                </label>
                <label className={settingsLabelClass}>
                  Stroke
                  <input className={settingsInputClass} type="number" min={1} max={10} value={selectedConnector.strokeWidth || 2.5} onChange={event => updateConnector(selectedConnector.id, { strokeWidth: parseNumberField(event.target.value, 2.5) })} />
                </label>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
                <input type="checkbox" checked={Boolean(selectedConnector.dashed)} onChange={event => updateConnector(selectedConnector.id, { dashed: event.target.checked })} />
                Dashed line
              </label>
              <button type="button" className={cn(footerButtonClass, 'mt-3 w-full')} onClick={() => deleteConnector(selectedConnector.id)}>Delete connector</button>
            </div>
          </div>
        </aside>
      );
    }

    if (selectedCardIds.length > 1) {
      const selectedCards = cards.filter(c => selectedCardIds.includes(c.id));

      const bulkSetColor = (color: string) => {
        setCards(current => current.map(card => {
          if (!selectedCardIds.includes(card.id)) return card;
          const updatedCard = { ...card, color };
          if (card.type === 'sticky') {
            updatedCard.content = { ...asObjectContent(card.content), backgroundColor: color };
          } else if (card.type === 'shape') {
            updatedCard.content = { ...asObjectContent(card.content), fill: color };
          }
          return updatedCard;
        }));
      };

      const alignCards = (type: 'left' | 'right' | 'top' | 'bottom') => {
        if (selectedCards.length < 2) return;
        const lefts = selectedCards.map(c => c.x);
        const rights = selectedCards.map(c => c.x + c.width);
        const tops = selectedCards.map(c => c.y);
        const bottoms = selectedCards.map(c => c.y + c.height);

        const targetLeft = Math.min(...lefts);
        const targetRight = Math.max(...rights);
        const targetTop = Math.min(...tops);
        const targetBottom = Math.max(...bottoms);

        setCards(current => current.map(card => {
          if (!selectedCardIds.includes(card.id)) return card;
          switch (type) {
            case 'left':
              return { ...card, x: targetLeft };
            case 'right':
              return { ...card, x: targetRight - card.width };
            case 'top':
              return { ...card, y: targetTop };
            case 'bottom':
              return { ...card, y: targetBottom - card.height };
            default:
              return card;
          }
        }));
      };

      return (
        <aside className={cn('sticky top-6 max-h-[calc(100vh-3rem)] overflow-auto border p-4', panelClass)} aria-label="Bulk card settings">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Bulk settings</p>
              <h3 className="mt-2 text-lg font-black text-slate-900">{selectedCardIds.length} Cards</h3>
            </div>
            <button type="button" className={footerButtonClass} onClick={() => { setSelectedCardIds([]); setSelectedCardId(null); }}>Clear</button>
          </div>
          <div className="mt-4 space-y-3">
            <div className={settingsSectionClass}>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Color (Bulk)</p>
              {renderColorSwatches('', bulkSetColor)}
            </div>

            <div className={settingsSectionClass}>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Align Elements</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={footerButtonClass} onClick={() => alignCards('left')}>Align Left</button>
                <button type="button" className={footerButtonClass} onClick={() => alignCards('right')}>Align Right</button>
                <button type="button" className={footerButtonClass} onClick={() => alignCards('top')}>Align Top</button>
                <button type="button" className={footerButtonClass} onClick={() => alignCards('bottom')}>Align Bottom</button>
              </div>
            </div>

            <div className={settingsSectionClass}>
              <button type="button" className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold text-red-700 bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300 w-full transition" onClick={deleteSelectedCards}>
                Delete {selectedCardIds.length} Cards
              </button>
            </div>
          </div>
        </aside>
      );
    }

    if (!selectedCard) {
      return (
        <aside className={cn('sticky top-6 self-start border p-4', panelClass)} aria-label="Board settings">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Settings</p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className={settingsSectionClass}>
              <p className="font-semibold">Select any card to edit its settings.</p>
              <p className="mt-2 text-xs text-slate-500">Cards: {cards.length} · Connectors: {connectors.length}</p>
              <button type="button" className={cn(footerButtonClass, 'mt-3 w-full')} onClick={() => setShowToolsPanel(value => !value)}>
                {showToolsPanel ? 'Hide tools panel' : 'Show tools panel'}
              </button>
            </div>
          </div>
        </aside>
      );
    }

    return (
      <aside className={cn('sticky top-6 max-h-[calc(100vh-3rem)] overflow-auto border p-4', panelClass)} aria-label="Card settings">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Settings</p>
            <h3 className="mt-2 text-lg font-black capitalize text-slate-900">{selectedCard.type}</h3>
          </div>
          <button type="button" className={footerButtonClass} onClick={() => selectCard(null)}>Done</button>
        </div>
        <div className="mt-4 space-y-3">
          {renderCommonCardSettings()}
          {renderTypeSpecificSettings()}
        </div>
      </aside>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[600px] flex-col items-center justify-center bg-neo-bg text-neo-black font-space relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-10"></div>
        <div className="relative">
          <div className="w-16 h-16 neo-border bg-neo-accent animate-spin-slow neo-shadow-sm"></div>
          <div className="absolute inset-0 flex items-center justify-center">
             <i className="fas fa-bolt text-xl text-white"></i>
          </div>
        </div>
        <p className="mt-6 font-black text-lg uppercase tracking-widest animate-pulse">Loading board...</p>
      </div>
    );
  }

  return (
    <div className={cn('relative min-h-full font-space overflow-hidden', isFocusMode ? 'bg-slate-950 text-slate-50' : 'bg-neo-bg text-neo-black', isFullscreen && 'fixed inset-0 z-[100] h-screen w-screen bg-slate-900')}>
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0',
          isFocusMode
            ? 'bg-[linear-gradient(to_right,rgba(226,232,240,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(226,232,240,0.06)_1px,transparent_1px)] [background-size:36px_36px]'
            : 'bg-[linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:36px_36px]',
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0',
          isFocusMode
            ? 'bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.18),transparent_38%)]'
            : 'bg-white',
        )}
      />

      {isFullscreen ? (
        /* Fullscreen Layout: Workspace covers 100% viewport. Minimal HUD on top of it. */
        <div className="relative h-full w-full flex flex-col">
          {/* Header HUD overlay */}
          
          <div className="absolute top-4 w-[60vw] px-4 z-50 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/90 border border-slate-700/80 backdrop-blur p-1.5 rounded-2xl shadow-xl text-white">
              <button 
                type="button" 
                onClick={() => setShowToolsPanel(val => !val)} 
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition"
                title={showToolsPanel ? 'Hide tools' : 'Show tools'}
              >
                {showToolsPanel ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => zoomFromControls('out')} className="h-8 w-8 grid place-items-center rounded-xl hover:bg-slate-800 transition" title="Zoom out">
                <FiMinus className="h-4 w-4" />
              </button>
              <ScaleLabel scale={viewport.scale} focusMode={isFocusMode} />
              <button type="button" onClick={() => zoomFromControls('in')} className="h-8 w-8 grid place-items-center rounded-xl hover:bg-slate-800 transition" title="Zoom in">
                <FiPlus className="h-4 w-4" />
              </button>
              <span className="h-4 w-px bg-slate-800 mx-1"></span>
              <button type="button" onClick={() => setIsFocusMode(val => !val)} className="flex h-8 px-2.5 items-center gap-1.5 rounded-xl hover:bg-slate-800 transition" title="Toggle Theme focus">
                {isFocusMode ? <FiSun className="h-3.5 w-3.5" /> : <FiMoon className="h-3.5 w-3.5" />}
                <span className="text-[10px] font-bold uppercase">{isFocusMode ? 'Light' : 'Focus'}</span>
              </button>
              <button type="button" onClick={triggerStickyCapture} className="flex h-8 px-2.5 items-center gap-1.5 rounded-xl hover:bg-slate-800 transition" title="Capture notes">
                <FiZap className="h-3.5 w-3.5 text-yellow-400" />
                <span className="text-[10px] font-bold uppercase">Capture</span>
              </button>
              <button type="button" onClick={fitToContent} className="flex h-8 px-2.5 items-center gap-1.5 rounded-xl hover:bg-slate-800 transition" title="Fit to screen">
                <FiMaximize2 className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold uppercase">Fit</span>
              </button>
              <button 
                type="button" 
                onClick={() => setIsFullscreen(false)} 
                className="flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 text-slate-100 hover:bg-slate-800 px-3 text-xs font-black uppercase tracking-wider shadow-xl transition"
              >
                Exit Fullscreen
              </button>
            </div>
          </div>

          {/* Left Mini Icon-Only Toolbar Panel overlay */}
          {showToolsPanel && (
            <div className="absolute top-20 left-4 bottom-20 z-50 w-14 bg-slate-900/95 border border-slate-700/80 backdrop-blur rounded-2xl shadow-2xl flex flex-col p-2.5 gap-4 overflow-y-auto max-h-[75vh]">
              {/* Tools Section */}
              <div className="flex flex-col gap-1.5 items-center border-b border-slate-800 pb-3">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Tool</span>
                {TOOLBAR_ITEMS.map(item => {
                  const Icon = item.icon;
                  const active = tool === item.tool;
                  return (
                    <button 
                      key={item.tool} 
                      type="button" 
                      onClick={() => setTool(item.tool)} 
                      className={cn('grid h-9 w-9 place-items-center rounded-xl transition', active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white')} 
                      title={item.label}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>

              {/* Add Cards Section */}
              <div className="flex flex-col gap-1.5 items-center border-b border-slate-800 pb-3">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Add</span>
                {CARD_ITEMS.map(item => {
                  const Icon = item.icon;
                  return (
                    <button 
                      key={item.type} 
                      type="button" 
                      onClick={() => addCard(item.type)} 
                      className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition" 
                      title={`Add ${item.label}`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
                <button 
                  type="button" 
                  onClick={() => addCard('sticky', 5)} 
                  className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition" 
                  title="Bulk add stickies"
                >
                  <FiZap className="h-4 w-4" />
                </button>
              </div>

              {/* Data Sources Section */}
              <div className="flex flex-col gap-1.5 items-center">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Data</span>
                <button 
                  type="button" 
                  onClick={openCrmModal} 
                  className="grid h-9 w-9 place-items-center rounded-xl text-emerald-400 hover:bg-slate-800 hover:text-emerald-300 transition" 
                  title="CRM Leads"
                >
                  <FiUsers className="h-4 w-4" />
                </button>
                <button 
                  type="button" 
                  onClick={openPlanningModal} 
                  className="grid h-9 w-9 place-items-center rounded-xl text-violet-400 hover:bg-slate-800 hover:text-violet-300 transition" 
                  title="Planning Files"
                >
                  <FiFileText className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Core Workspace Frame spanning entire Viewport */}
          <div className="flex-1 h-full w-full overflow-hidden relative">
            <div
              ref={canvasRef}
              className={cn('relative h-full w-full overflow-auto touch-none select-none', isPanning ? 'cursor-grabbing' : tool === 'hand' ? 'cursor-grab' : 'cursor-default')}
              onWheel={handleWheel}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
            >
              <div
                className="board-world absolute left-0 top-0 origin-top-left overflow-visible"
                style={{
                  width: BOARD_WIDTH,
                  height: BOARD_HEIGHT,
                  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                }}
              >
                {frameCards.map(card => (
                  <Frame
                    key={card.id}
                    card={card}
                    cards={cards}
                    tool={tool}
                    scale={viewport.scale}
                    isSelected={selectedCardIds.includes(card.id)}
                    isConnectingFrom={pendingConnector.from === card.id}
                    pendingConnectorFrom={pendingConnector.from}
                    moveCard={moveCard}
                    resizeCard={resizeCard}
                    deleteCard={deleteCard}
                    updateCardContent={updateCardContent}
                    selectCard={selectCard}
                    startConnector={startConnector}
                    finishConnector={finishConnector}
                  />
                ))}

                <svg className="pointer-events-none absolute inset-0 z-20 overflow-visible" width={BOARD_WIDTH} height={BOARD_HEIGHT}>
                  <defs>
                    <marker id="board-arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L0,6 L9,3 z" className="fill-slate-500" />
                    </marker>
                  </defs>
                  {connectors.map(connector => (
                    <ConnectorLine
                      key={connector.id}
                      connector={connector}
                      cards={cards}
                      isSelected={selectedConnectorId === connector.id}
                      onSelect={selectConnector}
                      onDelete={deleteConnector}
                    />
                  ))}
                  {pendingConnector.from && <PendingConnectorLine from={pendingConnector.from} mousePos={mouseBoardPos} cards={cards} />}
                </svg>

                {nonFrameCards.map(card => (
                  <BoardCard
                    key={card.id}
                    card={card}
                    tool={tool}
                    scale={viewport.scale}
                    isSelected={selectedCardIds.includes(card.id)}
                    isConnectingFrom={pendingConnector.from === card.id}
                    pendingConnectorFrom={pendingConnector.from}
                    moveCard={moveCard}
                    resizeCard={resizeCard}
                    deleteCard={deleteCard}
                    updateCardContent={updateCardContent}
                    selectCard={selectCard}
                    startConnector={startConnector}
                    finishConnector={finishConnector}
                  />
                ))}

                {selectionBox && (
                  <div
                    className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none z-50 rounded"
                    style={{
                      left: Math.min(selectionBox.startX, selectionBox.endX),
                      top: Math.min(selectionBox.startY, selectionBox.endY),
                      width: Math.abs(selectionBox.endX - selectionBox.startX),
                      height: Math.abs(selectionBox.endY - selectionBox.startY),
                      borderStyle: 'dashed',
                      borderWidth: '1.5px',
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Right Mini Icon-Only Settings overlay */}
          {(selectedCard || selectedCardIds.length > 0 || selectedConnector) && (
            <div className="absolute top-20 left-20 bottom-20 z-50 w-72 bg-slate-900/95 border border-slate-700/80 backdrop-blur rounded-2xl shadow-2xl flex flex-col p-4 overflow-y-auto max-h-[50vh] text-white">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-400">Settings console</span>
                <button type="button" onClick={() => { selectCard(null); setSelectedCardIds([]); setSelectedConnectorId(null); }} className="text-xs text-slate-400 hover:text-white">Done</button>
              </div>
              <div className="space-y-4">
                {renderSettingsPanel()}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Regular Desktop Layout flow */
        <div className="relative z-10 mx-auto flex max-w-[1700px] flex-col gap-6 px-6 pb-8 pt-6 xl:px-0">
          <div className={cn('p-2')}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between px-8">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={currentBoard}
                  onChange={event => switchBoard(event.target.value)}
                  className={cn(
                    'h-10 min-w-[170px] border-2 border-black px-4 text-xs font-black uppercase tracking-widest outline-none transition cursor-pointer',
                    isFocusMode ? 'border-white bg-slate-800 text-slate-100' : 'border-black bg-white text-slate-700',
                  )}
                >
                  {boardList.map(board => (
                    <option key={board} value={board}>
                      {board}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={handleCreateBoard} className={footerButtonClass} title="Create board" aria-label="Create board">
                  <FiPlus className="h-4 w-4" />
                </button>
                {currentBoard !== 'default' && (
                  <button type="button" onClick={handleRenameBoard} className={footerButtonClass} title="Rename board" aria-label="Rename board">
                    <FiEdit2 className="h-4 w-4" />
                  </button>
                )}
                {currentBoard !== 'default' && (
                  <button type="button" onClick={handleDeleteBoard} className={footerButtonClass} title="Delete board" aria-label="Delete board">
                    <FiTrash2 className="h-4 w-4" />
                  </button>
                )}
                <button type="button" onClick={() => setShowToolsPanel(value => !value)} className={footerButtonClass} title={showToolsPanel ? 'Hide tools' : 'Show tools'}>
                  {showToolsPanel ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                  <span>{showToolsPanel ? 'Hide tools' : 'Show tools'}</span>
                </button>
                <button type="button" onClick={() => setIsFullscreen(true)} className={cn(footerButtonClass, 'bg-blue-600/10 border-blue-200 text-blue-700 hover:bg-blue-600/20')} title="Enter Fullscreen Mode">
                  <FiMaximize2 className="h-4 w-4" />
                  <span>Fullscreen</span>
                </button>
              </div>
            </div>
          </div>

          <div className={cn('grid gap-6 px-4', showToolsPanel ? 'xl:grid-cols-[240px_minmax(0,1fr)_320px]' : 'xl:grid-cols-[minmax(0,1fr)_320px]')}>
            {showToolsPanel && (
              <aside className={cn('sticky top-6 self-start border p-4', panelClass)} aria-label="Board tools">
              <div className="space-y-4">
                <div className={isFocusMode ? 'border-2 border-white p-3' : 'border-2 border-black p-3 bg-neo-bg'}>
                  <p className="text-xs font-black uppercase tracking-[0.28em] mb-3">Tools</p>
                  <div className="mt-1 space-y-1.5">
                    {TOOLBAR_ITEMS.map(item => {
                      const Icon = item.icon;
                      return (
                        <button key={item.tool} type="button" onClick={() => setTool(item.tool)} className={toolButtonClass(tool === item.tool)} title={item.label}>
                          <span className={cn('grid h-8 w-8 shrink-0 place-items-center border-2 border-black', tool === item.tool ? 'bg-neo-accent text-black' : isFocusMode ? 'bg-white/10 text-slate-200 border-white' : 'bg-white text-slate-700')}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={isFocusMode ? 'border-2 border-white p-3' : 'border-2 border-black p-3 bg-neo-bg'}>
                  <p className="text-xs font-black uppercase tracking-[0.28em] mb-3">Add cards</p>
                  <div className="mt-1 space-y-1.5">
                    {CARD_ITEMS.map(item => {
                      const Icon = item.icon;
                      return (
                        <button key={item.type} type="button" onClick={() => addCard(item.type)} className={toolButtonClass(false)} title={`Add ${item.label}`}>
                          <span className={cn('grid h-8 w-8 shrink-0 place-items-center border-2 border-black', isFocusMode ? 'bg-white/10 text-slate-200 border-white' : 'bg-white text-slate-700')}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => addCard('sticky', 5)} className={toolButtonClass(false)} title="Add five sticky notes">
                      <span className={cn('grid h-8 w-8 shrink-0 place-items-center border-2 border-black', isFocusMode ? 'bg-white/10 text-slate-200 border-white' : 'bg-neo-secondary text-black')}>
                        <FiZap className="h-4 w-4" />
                      </span>
                      <span className="truncate">Bulk</span>
                    </button>
                  </div>
                </div>

                <div className={isFocusMode ? 'border-2 border-white p-3' : 'border-2 border-black p-3 bg-neo-bg'}>
                  <p className="text-xs font-black uppercase tracking-[0.28em] mb-3">Data Sources</p>
                  <div className="mt-1 space-y-1.5">
                    <button
                      type="button"
                      onClick={openCrmModal}
                      className={toolButtonClass(false)}
                      title="Import CRM leads as a card"
                    >
                      <span className={cn('grid h-8 w-8 shrink-0 place-items-center border-2', isFocusMode ? 'bg-white/10 text-emerald-200 border-white' : 'bg-[#DCFCE7] text-emerald-700 border-black')}>
                        <FiUsers className="h-4 w-4" />
                      </span>
                      <span className="truncate">CRM Leads</span>
                    </button>
                    <button
                      type="button"
                      onClick={openPlanningModal}
                      className={toolButtonClass(false)}
                      title="Import planning file content as cards"
                    >
                      <span className={cn('grid h-8 w-8 shrink-0 place-items-center border-2', isFocusMode ? 'bg-white/10 text-violet-200 border-white' : 'bg-[#EDE9FE] text-violet-700 border-black')}>
                        <FiFileText className="h-4 w-4" />
                      </span>
                      <span className="truncate">Planning Files</span>
                    </button>
                  </div>
                </div>
              </div>
            </aside>
            )}

            <section className="flex min-h-[520px] flex-col overflow-hidden w-[100%] border-4 border-black bg-white neo-shadow-md">
              <div className="flex flex-col gap-3 border-b-2 border-black px-5 py-4 lg:flex-row lg:items-center lg:justify-between bg-neo-bg">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-black/60">Board workspace</p>
                  <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-slate-950">{currentBoard}</h2>
                </div>
              </div>

              <div className={cn('relative flex-1 overflow-hidden', isFocusMode ? 'bg-slate-950/80' : 'bg-slate-50')}>
                <div
                  ref={canvasRef}
                  className={cn(' relative h-full overflow-auto touch-none select-none', isPanning ? 'cursor-grabbing' : tool === 'hand' ? 'cursor-grab' : 'cursor-default')}
                  onWheel={handleWheel}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                >
                  <div
                    className="board-world absolute left-0 top-0 origin-top-left overflow-visible"
                    style={{
                      width: BOARD_WIDTH,
                      height: BOARD_HEIGHT,
                      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                    }}
                  >
                    {frameCards.map(card => (
                      <Frame
                        key={card.id}
                        card={card}
                        cards={cards}
                        tool={tool}
                        scale={viewport.scale}
                        isSelected={selectedCardIds.includes(card.id)}
                        isConnectingFrom={pendingConnector.from === card.id}
                        pendingConnectorFrom={pendingConnector.from}
                        moveCard={moveCard}
                        resizeCard={resizeCard}
                        deleteCard={deleteCard}
                        updateCardContent={updateCardContent}
                        selectCard={selectCard}
                        startConnector={startConnector}
                        finishConnector={finishConnector}
                      />
                    ))}

                    <svg className="pointer-events-none absolute inset-0 z-20 overflow-visible" width={BOARD_WIDTH} height={BOARD_HEIGHT}>
                      <defs>
                        <marker id="board-arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                          <path d="M0,0 L0,6 L9,3 z" className="fill-slate-500" />
                        </marker>
                      </defs>
                      {connectors.map(connector => (
                        <ConnectorLine
                          key={connector.id}
                          connector={connector}
                          cards={cards}
                          isSelected={selectedConnectorId === connector.id}
                          onSelect={selectConnector}
                          onDelete={deleteConnector}
                        />
                      ))}
                      {pendingConnector.from && <PendingConnectorLine from={pendingConnector.from} mousePos={mouseBoardPos} cards={cards} />}
                    </svg>

                    {nonFrameCards.map(card => (
                      <BoardCard
                        key={card.id}
                        card={card}
                        tool={tool}
                        scale={viewport.scale}
                        isSelected={selectedCardIds.includes(card.id)}
                        isConnectingFrom={pendingConnector.from === card.id}
                        pendingConnectorFrom={pendingConnector.from}
                        moveCard={moveCard}
                        resizeCard={resizeCard}
                        deleteCard={deleteCard}
                        updateCardContent={updateCardContent}
                        selectCard={selectCard}
                        startConnector={startConnector}
                        finishConnector={finishConnector}
                      />
                    ))}

                    {selectionBox && (
                      <div
                        className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none z-50 rounded"
                        style={{
                          left: Math.min(selectionBox.startX, selectionBox.endX),
                          top: Math.min(selectionBox.startY, selectionBox.endY),
                          width: Math.abs(selectionBox.endX - selectionBox.startX),
                          height: Math.abs(selectionBox.endY - selectionBox.startY),
                          borderStyle: 'dashed',
                          borderWidth: '1.5px',
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className={cn('flex flex-wrap gap-2 border-t border-slate-200 px-5 py-4 bg-white/95', panelClass)} aria-label="Zoom and board controls">
                <button type="button" onClick={() => zoomFromControls('out')} className={footerButtonClass} title="Zoom out" aria-label="Zoom out">
                  <FiMinus className="h-4 w-4" />
                </button>
                <ScaleLabel scale={viewport.scale} focusMode={isFocusMode} />
                <button type="button" onClick={() => zoomFromControls('in')} className={footerButtonClass} title="Zoom in" aria-label="Zoom in">
                  <FiPlus className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setIsFocusMode(value => !value)} className={footerButtonClass}>
                  {isFocusMode ? <FiSun className="h-4 w-4" /> : <FiMoon className="h-4 w-4" />}
                  <span>{isFocusMode ? 'Light' : 'Focus'}</span>
                </button>
                <button type="button" onClick={triggerStickyCapture} className={footerButtonClass}>
                  <FiZap className="h-4 w-4" />
                  <span>Capture</span>
                </button>
                <button type="button" onClick={fitToContent} className={footerButtonClass}>
                  <FiMaximize2 className="h-4 w-4" />
                  <span>Fit</span>
                </button>
              </div>
            </section>

            {renderSettingsPanel()}
          </div>
        </div>
      )}

      {isScanning && (
        <div className={cn('absolute inset-0 z-[70] grid place-items-center overflow-hidden backdrop-blur-xl', isFocusMode ? 'bg-slate-950/70 text-slate-50' : 'bg-white/70 text-slate-950')} role="status" aria-live="polite">
          <div className="relative grid place-items-center gap-3 text-center">
            <div className="absolute -top-28 left-1/2 h-28 w-40 -translate-x-[85%] -rotate-6 animate-pulse rounded-2xl bg-yellow-200 shadow-2xl" />
            <div className="absolute -top-24 left-1/2 h-28 w-40 -translate-x-[8%] rotate-3 animate-pulse rounded-2xl bg-green-200 shadow-2xl" />
            <div className="absolute -top-10 left-1/2 h-28 w-40 -translate-x-1/2 rotate-1 animate-pulse rounded-2xl bg-indigo-200 shadow-2xl" />
            <strong className="mt-20 text-lg">Capturing stickies</strong>
            <span className={cn('text-sm', isFocusMode ? 'text-slate-300' : 'text-slate-500')}>Finding notes and placing them on the board...</span>
          </div>
        </div>
      )}

      {/* ── CRM Leads Import Modal ──────────────────────────────────────── */}
      {dataSourceModal === 'crm' && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Import CRM leads">
          <div className="relative flex w-full max-w-2xl flex-col border-4 border-black bg-white neo-shadow-lg" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center justify-between border-b-2 border-black bg-neo-bg px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center border-2 border-black bg-neo-secondary text-black">
                  <FiUsers className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-black text-black uppercase">Import CRM Leads</h2>
                  <p className="text-xs font-bold text-black/60 uppercase">Select leads to add as a table card on the board</p>
                </div>
              </div>
              <button type="button" onClick={() => setDataSourceModal('none')} className="grid h-8 w-8 place-items-center border-2 border-black bg-white text-black hover:bg-neo-accent hover:text-white transition">
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              {crmLoading ? (
                <div className="flex h-32 items-center justify-center text-slate-400">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                  <span className="ml-3 text-sm">Loading leads…</span>
                </div>
              ) : crmLeads.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-slate-400">
                  <FiDatabase className="h-8 w-8" />
                  <p className="text-sm">No CRM leads found.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-500">{crmLeads.length} leads · {crmSelectedIds.size} selected</p>
                    <button
                      type="button"
                      onClick={() => setCrmSelectedIds(crmSelectedIds.size === crmLeads.length ? new Set() : new Set(crmLeads.map(l => l.id)))}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-800 transition"
                    >
                      {crmSelectedIds.size === crmLeads.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  {crmLeads.map(lead => (
                    <label key={lead.id} className={cn('flex cursor-pointer items-start gap-3 border-2 p-3 transition hover:bg-[#FFFDF5]', crmSelectedIds.has(lead.id) ? 'border-black bg-neo-secondary/30' : 'border-black/20 bg-white')}>
                      <input type="checkbox" className="mt-0.5 accent-black" checked={crmSelectedIds.has(lead.id)} onChange={() => toggleCrmLead(lead.id)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-black uppercase">{lead.name}</p>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-black/60">
                          {lead.company && <span>{lead.company}</span>}
                          <span className={cn('border border-black px-1.5 py-0.5 font-black text-[9px] uppercase', lead.status === 'WON' ? 'bg-[#4ADE80] text-black' : lead.status === 'LOST' ? 'bg-[#FF6B6B] text-black' : lead.status === 'QUALIFIED' ? 'bg-[#60A5FA] text-black' : 'bg-neo-secondary text-black')}>{lead.status}</span>
                          <span>{lead.source}</span>
                          {lead.value && <span className="font-black text-black">{lead.value}</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t-2 border-black bg-neo-bg px-6 py-4">
              <button type="button" onClick={() => setDataSourceModal('none')} className="border-2 border-black bg-white hover:bg-[#FFFDF5] px-4 py-2 text-xs font-black uppercase text-black transition">Cancel</button>
              <button
                type="button"
                onClick={importCrmLeads}
                disabled={crmSelectedIds.size === 0}
                className="flex items-center gap-2 bg-[#4ADE80] border-2 border-black hover:bg-[#3ec473] px-5 py-2 text-xs font-black uppercase text-black shadow-[4px_4px_0px_0px_black] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <FiPlus className="h-4 w-4" />
                Add {crmSelectedIds.size > 0 ? `${crmSelectedIds.size} lead${crmSelectedIds.size > 1 ? 's' : ''}` : 'leads'} to board
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Planning Files Import Modal ──────────────────────────────────── */}
      {dataSourceModal === 'planning' && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Import planning files">
          <div className="relative flex w-full max-w-2xl flex-col border-4 border-black bg-white neo-shadow-lg" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center justify-between border-b-2 border-black bg-neo-bg px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center border-2 border-black bg-neo-muted text-black">
                  <FiFileText className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-black text-black uppercase">Import Planning Files</h2>
                  <p className="text-xs font-bold text-black/60 uppercase">Select files to add as sticky cards on the board</p>
                </div>
              </div>
              <button type="button" onClick={() => setDataSourceModal('none')} className="grid h-8 w-8 place-items-center border-2 border-black bg-white text-black hover:bg-neo-accent hover:text-white transition">
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              {planningLoading ? (
                <div className="flex h-32 items-center justify-center text-slate-400">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />
                  <span className="ml-3 text-sm">Loading files…</span>
                </div>
              ) : planningFiles.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-slate-400">
                  <FiFileText className="h-8 w-8" />
                  <p className="text-sm">No planning files found.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-500">{planningFiles.length} files · {planningSelectedPaths.size} selected</p>
                    <button
                      type="button"
                      onClick={() => setPlanningSelectedPaths(planningSelectedPaths.size === planningFiles.length ? new Set() : new Set(planningFiles.map(f => f.path)))}
                      className="text-xs font-medium text-violet-600 hover:text-violet-800 transition"
                    >
                      {planningSelectedPaths.size === planningFiles.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  {planningFiles.map(file => (
                    <label key={file.path} className={cn('flex cursor-pointer items-center gap-3 border-2 p-3 transition hover:bg-[#FFFDF5]', planningSelectedPaths.has(file.path) ? 'border-black bg-neo-secondary/20' : 'border-black/20 bg-white')}>
                      <input type="checkbox" className="accent-black" checked={planningSelectedPaths.has(file.path)} onChange={() => togglePlanningFile(file.path)} />
                      <FiFileText className="h-4 w-4 shrink-0 text-violet-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-black uppercase">{file.name}</p>
                        <p className="truncate text-xs text-black/50">{file.path}</p>
                      </div>
                      {file.fileType && (
                        <span className="border-2 border-black px-1.5 py-0.5 text-[9px] font-black uppercase text-black bg-neo-secondary">{file.fileType}</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t-2 border-black bg-neo-bg px-6 py-4">
              <button type="button" onClick={() => setDataSourceModal('none')} className="border-2 border-black bg-white hover:bg-[#FFFDF5] px-4 py-2 text-xs font-black uppercase text-black transition">Cancel</button>
              <button
                type="button"
                onClick={importPlanningFiles}
                disabled={planningSelectedPaths.size === 0 || planningImporting}
                className="flex items-center gap-2 bg-[#C4B5FD] border-2 border-black hover:bg-[#b0a0f0] px-5 py-2 text-xs font-black uppercase text-black shadow-[4px_4px_0px_0px_black] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {planningImporting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black" />
                ) : (
                  <FiPlus className="h-4 w-4" />
                )}
                {planningImporting ? 'Importing…' : `Add ${planningSelectedPaths.size > 0 ? `${planningSelectedPaths.size} file${planningSelectedPaths.size > 1 ? 's' : ''}` : 'files'} to board`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Custom Board Create/Rename/Delete Modal ── */}
      {boardModalType !== 'none' && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Board Action Modal">
          <div className="relative flex w-full max-w-md flex-col border-4 border-black bg-white neo-shadow-lg p-6">
            <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-4 bg-neo-bg -m-6 p-6">
              <h2 className="text-base font-black text-black uppercase">
                {boardModalType === 'create' ? 'Create New Board' : boardModalType === 'rename' ? 'Rename Board' : 'Delete Board'}
              </h2>
              <button type="button" onClick={() => setBoardModalType('none')} className="grid h-8 w-8 place-items-center border-2 border-black bg-white text-black hover:bg-neo-accent hover:text-white transition">
                <FiX className="h-4 w-4" />
              </button>
            </div>

            {boardModalType === 'delete' ? (
              <p className="text-xs font-bold text-black uppercase my-6">
                Are you sure you want to delete board <strong>"{currentBoard}"</strong>? This action cannot be undone.
              </p>
            ) : (
              <div className="my-6">
                <label className="block text-[10px] font-black uppercase tracking-widest text-black/60 mb-2">Board Name</label>
                <input
                  type="text"
                  className="w-full border-2 border-black bg-white px-3 py-2 text-xs font-bold uppercase text-black outline-none focus:bg-neo-bg"
                  value={boardModalValue}
                  onChange={e => setBoardModalValue(e.target.value)}
                  placeholder="e.g. My Strategy Board"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') submitBoardModal();
                  }}
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setBoardModalType('none')} className="border-2 border-black bg-white hover:bg-[#FFFDF5] px-4 py-2 text-xs font-black uppercase text-black transition">Cancel</button>
              <button
                type="button"
                onClick={submitBoardModal}
                className={cn(
                  "border-2 border-black px-5 py-2 text-xs font-black uppercase text-black shadow-[4px_4px_0px_0px_black] transition",
                  boardModalType === 'delete'
                    ? "bg-[#FF6B6B] hover:opacity-90"
                    : "bg-[#FFD93D] hover:opacity-90"
                )}
              >
                {boardModalType === 'create' ? 'Create' : boardModalType === 'rename' ? 'Rename' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardPage;
