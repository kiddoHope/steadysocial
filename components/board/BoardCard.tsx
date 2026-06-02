import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import {
  FiAlignCenter,
  FiAlignLeft,
  FiAlignRight,
  FiArrowRight,
  FiBarChart2,
  FiBold,
  FiCalendar,
  FiCode,
  FiCpu,
  FiGrid,
  FiImage,
  FiItalic,
  FiLink2,
  FiList,
  FiMaximize2,
  FiPlus,
  FiSquare,
  FiTrash2,
  FiType,
  FiUploadCloud,
  FiLayers,
} from 'react-icons/fi';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Card, Tool } from '../../pages/BoardPage';

interface BoardCardProps {
  card: Card;
  tool: Tool;
  scale: number;
  isSelected: boolean;
  isConnectingFrom: boolean;
  pendingConnectorFrom: string | null;
  moveCard: (id: string, x: number, y: number) => void;
  resizeCard: (id: string, width: number, height: number) => void;
  deleteCard: (id: string) => void;
  updateCardContent: (id: string, content: any) => void;
  selectCard: (id: string | null, shiftKey?: boolean) => void;
  startConnector: (id: string) => void;
  finishConnector: (id: string) => void;
}

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

type ResizeState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
};

type ChartKind = 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'radar';
type ChartDatum = { name: string; value: number; value2?: number };

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const CARD_META: Record<string, { label: string; icon: IconType }> = {
  sticky: { label: 'Sticky', icon: FiLayers },
  text: { label: 'Text', icon: FiType },
  image: { label: 'Image', icon: FiImage },
  chart: { label: 'Chart', icon: FiBarChart2 },
  code: { label: 'Code', icon: FiCode },
  table: { label: 'Table', icon: FiGrid },
  shape: { label: 'Shape', icon: FiSquare },
  diagram: { label: 'Diagram', icon: FiCpu },
};

const CHART_COLORS = ['#2563eb', '#7c3aed', '#16a34a', '#f97316', '#dc2626', '#0891b2', '#9333ea'];

const isInteractiveElement = (target: EventTarget) => {
  return Boolean((target as HTMLElement).closest('button, textarea, input, select, label, a, [contenteditable="true"]'));
};

const asObjectContent = (content: any) => (content && typeof content === 'object' && !Array.isArray(content) ? content : {});

const getTextContent = (content: any, fallback = '') => {
  if (typeof content === 'string') return content;
  if (content && typeof content.text === 'string') return content.text;
  if (content && typeof content.label === 'string') return content.label;
  return fallback;
};

const safeNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const simpleMarkdown = (text: string): string => {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin:2px 0;font-size:0.95em;font-weight:800">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin:2px 0;font-size:1.1em;font-weight:800">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin:2px 0;font-size:1.25em;font-weight:800">$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 4px;border-radius:4px;font-size:0.9em">$1</code>');
  html = html.replace(/^- (.+)$/gm, '<li style="list-style:disc;margin-left:16px">$1</li>');
  html = html.replace(/\[x\]/gi, '☑');
  html = html.replace(/\[ \]/g, '☐');
  html = html.replace(/\n/g, '<br>');
  return html;
};

const normalizeChartData = (data: unknown): ChartDatum[] => {
  if (Array.isArray(data) && data.length) {
    const mapped = data
      .map((item, index) => {
        if (typeof item === 'number') return { name: `Item ${index + 1}`, value: item };
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          return {
            name: String(record.name ?? record.label ?? `Item ${index + 1}`),
            value: safeNumber(record.value, 0),
            value2: record.value2 === undefined || record.value2 === '' ? undefined : safeNumber(record.value2, 0),
          };
        }
        return { name: `Item ${index + 1}`, value: safeNumber(item, 0) };
      })
      .filter(item => item.name.trim());
    if (mapped.length) return mapped;
  }

  return [
    { name: 'Mon', value: 34 },
    { name: 'Tue', value: 48 },
    { name: 'Wed', value: 28 },
    { name: 'Thu', value: 62 },
    { name: 'Fri', value: 45 },
  ];
};

const textInputClass = 'h-full w-full resize-none overflow-hidden border-0 bg-transparent text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400';
const smallButtonClass = 'grid h-7 w-7 place-items-center rounded-xl border border-slate-200/70 bg-white/75 text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700';
const smallTextButtonClass = 'inline-flex h-7 items-center justify-center gap-1 rounded-xl border border-slate-200/70 bg-white/80 px-2 text-[11px] font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700';
const miniInputClass = 'h-7 min-w-0 rounded-lg border border-slate-200 bg-white/80 px-2 text-xs text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200/60';
const editorButtonClass = 'grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white/85 text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700';

const BoardCard: React.FC<BoardCardProps> = ({
  card,
  tool,
  scale,
  isSelected,
  isConnectingFrom,
  pendingConnectorFrom,
  moveCard,
  resizeCard,
  deleteCard,
  updateCardContent,
  selectCard,
  startConnector,
  finishConnector,
}) => {
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const richTextRef = useRef<HTMLDivElement | null>(null);
  const [isEditingSticky, setIsEditingSticky] = useState(false);

  useEffect(() => {
    if (!isSelected) setIsEditingSticky(false);
  }, [isSelected]);

  const objectContent = asObjectContent(card.content);
  const showChrome = objectContent.showChrome !== false;

  const richTextHtml = useMemo(() => {
    if (card.type !== 'text') return '';
    const content = asObjectContent(card.content);
    if (typeof content.html === 'string') return content.html;
    return escapeHtml(getTextContent(card.content, 'Add a text block')).replace(/\n/g, '<br />');
  }, [card.content, card.type]);

  useEffect(() => {
    if (card.type !== 'text' || !richTextRef.current) return;
    if (document.activeElement === richTextRef.current) return;
    richTextRef.current.innerHTML = richTextHtml;
  }, [card.type, richTextHtml]);

  const handleConnectorClick = () => {
    if (!pendingConnectorFrom) {
      startConnector(card.id);
      return;
    }

    finishConnector(card.id);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    selectCard(card.id, event.shiftKey);

    if (isInteractiveElement(event.target)) return;

    if (tool === 'connector') {
      handleConnectorClick();
      return;
    }

    if (tool !== 'select') return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: card.x,
      startY: card.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;

    const nextX = dragRef.current.startX + (event.clientX - dragRef.current.startClientX) / scale;
    const nextY = dragRef.current.startY + (event.clientY - dragRef.current.startClientY) / scale;
    moveCard(card.id, Math.round(nextX), Math.round(nextY));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== 'select') return;

    event.preventDefault();
    event.stopPropagation();
    selectCard(card.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: card.width,
      startHeight: card.height,
    };
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current || resizeRef.current.pointerId !== event.pointerId) return;

    const nextWidth = resizeRef.current.startWidth + (event.clientX - resizeRef.current.startClientX) / scale;
    const nextHeight = resizeRef.current.startHeight + (event.clientY - resizeRef.current.startClientY) / scale;
    resizeCard(card.id, Math.round(nextWidth), Math.round(nextHeight));
  };

  const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeRef.current = null;
  };

  const updateText = (value: string) => {
    if (typeof card.content === 'string') {
      updateCardContent(card.id, value);
      return;
    }
    updateCardContent(card.id, { ...card.content, text: value });
  };

  const updateObjectContent = (patch: Record<string, unknown>) => {
    updateCardContent(card.id, { ...asObjectContent(card.content), ...patch });
  };

  const renderBody = () => {
    switch (card.type) {
      case 'sticky':
        return renderStickyCard();

      case 'text':
        return renderTextCard();

      case 'code':
        return renderCodeCard();

      case 'image':
        return renderImageCard();

      case 'chart':
        return renderChartCard();

      case 'table':
        return renderTableCard();

      case 'shape':
        return renderShapeCard();

      case 'diagram':
        return renderDiagramCard();

      default:
        return <div className="text-sm text-slate-700">{String(card.content || '')}</div>;
    }
  };

  const renderStickyCard = () => {
    const stickyContent = asObjectContent(card.content);
    const fontSize = safeNumber(stickyContent.fontSize, 18);

    return (
      <div className="grid h-full grid-rows-[auto_1fr] gap-2 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <input
            className="h-7 w-9 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            type="color"
            value={String(stickyContent.backgroundColor || card.color || '#fff7b8')}
            onChange={event => updateObjectContent({ backgroundColor: event.target.value })}
            aria-label="Sticky background color"
          />
          <input
            className="h-7 w-9 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            type="color"
            value={String(stickyContent.textColor || '#111827')}
            onChange={event => updateObjectContent({ textColor: event.target.value })}
            aria-label="Sticky text color"
          />
          <input
            className="h-7 w-14 rounded-lg border border-slate-200 bg-white/80 px-2 text-xs outline-none"
            type="number"
            min={10}
            max={64}
            value={fontSize}
            onChange={event => updateObjectContent({ fontSize: safeNumber(event.target.value, fontSize) })}
            aria-label="Sticky font size"
          />
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-slate-400">md</span>
        </div>
        {isEditingSticky ? (
          <textarea
            className="h-full w-full resize-none overflow-auto border-0 bg-transparent font-mono text-sm leading-snug text-slate-900 outline-none placeholder:text-slate-500"
            value={getTextContent(card.content)}
            onChange={event => updateObjectContent({ text: event.target.value })}
            onBlur={() => setIsEditingSticky(false)}
            autoFocus
            placeholder="**bold** *italic* # heading - list"
            style={{
              color: String(stickyContent.textColor || '#111827'),
              fontSize: Math.min(fontSize, 14),
              textAlign: (stickyContent.align as any) || 'left',
            }}
          />
        ) : (
          <div
            className="h-full w-full cursor-text overflow-auto leading-snug"
            onDoubleClick={() => setIsEditingSticky(true)}
            dangerouslySetInnerHTML={{ __html: simpleMarkdown(getTextContent(card.content)) || '<span class="text-slate-400">Write a note...</span>' }}
            style={{
              color: String(stickyContent.textColor || '#111827'),
              fontSize,
              textAlign: (stickyContent.align as any) || 'left',
            }}
          />
        )}
      </div>
    );
  };

  const applyRichTextCommand = (command: string, value?: string) => {
    richTextRef.current?.focus();
    document.execCommand(command, false, value);
    window.setTimeout(() => updateObjectContent({ html: richTextRef.current?.innerHTML || '' }), 0);
  };

  const renderTextCard = () => {
    const textContent = asObjectContent(card.content);
    const fontSize = safeNumber(textContent.fontSize, 15);

    const toolbarButton = (label: string, icon: React.ReactNode, command: string, value?: string) => (
      <button
        type="button"
        className={editorButtonClass}
        onMouseDown={event => event.preventDefault()}
        onClick={() => applyRichTextCommand(command, value)}
        aria-label={label}
        title={label}
      >
        {icon}
      </button>
    );

    return (
      <div className="grid h-full grid-rows-[auto_1fr] gap-2 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-1 overflow-hidden rounded-xl bg-slate-50/80 p-1">
          {toolbarButton('Bold', <FiBold className="h-3.5 w-3.5" />, 'bold')}
          {toolbarButton('Italic', <FiItalic className="h-3.5 w-3.5" />, 'italic')}
          {toolbarButton('Bullet list', <FiList className="h-3.5 w-3.5" />, 'insertUnorderedList')}
          {toolbarButton('Align left', <FiAlignLeft className="h-3.5 w-3.5" />, 'justifyLeft')}
          {toolbarButton('Align center', <FiAlignCenter className="h-3.5 w-3.5" />, 'justifyCenter')}
          {toolbarButton('Align right', <FiAlignRight className="h-3.5 w-3.5" />, 'justifyRight')}
          <select
            className={cn(miniInputClass, 'w-24')}
            value={String(textContent.block || 'p')}
            onChange={event => applyRichTextCommand('formatBlock', event.target.value)}
            onMouseDown={event => event.stopPropagation()}
            aria-label="Text block style"
          >
            <option value="p">Paragraph</option>
            <option value="h2">Heading</option>
            <option value="h3">Subhead</option>
            <option value="blockquote">Quote</option>
          </select>
        </div>
        <div
          ref={richTextRef}
          className="min-h-0 overflow-auto rounded-xl border border-slate-100 bg-white/40 p-2 text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200/60"
          contentEditable
          suppressContentEditableWarning
          onInput={event => updateObjectContent({ html: (event.currentTarget as HTMLDivElement).innerHTML })}
          style={{
            fontSize,
            color: String(textContent.textColor || '#1f2937'),
            backgroundColor: String(textContent.editorBackground || 'transparent'),
          }}
        />
      </div>
    );
  };

  const renderCodeCard = () => {
    const codeContent = asObjectContent(card.content);
    const text = getTextContent(card.content, 'function idea() {\n  return "ship it";\n}');

    return (
      <div className="grid h-full grid-rows-[auto_1fr] gap-2 overflow-hidden">
        <div className="flex items-center gap-2">
          <input
            className={cn(miniInputClass, 'flex-1')}
            value={String(codeContent.language || 'javascript')}
            onChange={event => updateObjectContent({ language: event.target.value })}
            aria-label="Code language"
          />
          <input
            className="h-7 w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 outline-none focus:border-blue-400"
            type="number"
            min={10}
            max={28}
            value={safeNumber(codeContent.fontSize, 13)}
            onChange={event => updateObjectContent({ fontSize: safeNumber(event.target.value, 13) })}
            aria-label="Code font size"
          />
        </div>
        <textarea
          className="h-full w-full resize-none overflow-auto rounded-2xl border-0 bg-slate-950 p-3 font-mono leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
          value={text}
          onChange={event => updateText(event.target.value)}
          spellCheck={false}
          style={{ fontSize: safeNumber(codeContent.fontSize, 13) }}
        />
      </div>
    );
  };

  const renderImageCard = () => {
    const imageContent = typeof card.content === 'object' && card.content ? card.content : { src: '', caption: '' };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        updateCardContent(card.id, { ...imageContent, src: String(reader.result || ''), caption: file.name });
      };
      reader.readAsDataURL(file);
    };

    return (
      <div className="grid h-full grid-rows-[1fr_auto] gap-2 overflow-hidden">
        <label className="grid min-h-0 w-full cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 text-center text-sm text-slate-500 transition hover:border-blue-300 hover:bg-blue-50/80">
          <input type="file" accept="image/*" hidden onChange={handleFileChange} />
          {imageContent.src ? (
            <img
              className="h-full w-full rounded-xl"
              src={imageContent.src}
              alt={imageContent.caption || 'Board upload'}
              style={{ objectFit: imageContent.fit || 'cover', opacity: safeNumber(imageContent.opacity, 1) }}
            />
          ) : (
            <span className="grid place-items-center gap-2 px-4">
              <FiUploadCloud className="h-8 w-8 text-blue-500" />
              <strong className="text-slate-700">Choose image</strong>
              <span className="text-xs">Upload a file or paste a URL below</span>
            </span>
          )}
        </label>
        <div className="grid gap-1.5">
          <input
            className={miniInputClass}
            value={imageContent.src || ''}
            onChange={event => updateCardContent(card.id, { ...imageContent, src: event.target.value })}
            placeholder="Image URL"
            aria-label="Image URL"
          />
          <input
            className={miniInputClass}
            value={imageContent.caption || ''}
            onChange={event => updateCardContent(card.id, { ...imageContent, caption: event.target.value })}
            placeholder="Caption"
            aria-label="Image caption"
          />
        </div>
      </div>
    );
  };

  const renderChartCard = () => {
    const chartContent = typeof card.content === 'object' && card.content ? card.content : { title: 'Chart', data: [] };
    const data = normalizeChartData(chartContent.data);
    const chartType = String(chartContent.chartType || 'bar') as ChartKind;

    const setData = (nextData: ChartDatum[]) => {
      updateCardContent(card.id, { ...chartContent, data: nextData.length ? nextData : [{ name: 'Item 1', value: 0 }] });
    };

    const updateDatum = (index: number, patch: Partial<ChartDatum>) => {
      setData(data.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
    };

    const renderChart = () => {
      if (chartType === 'line') {
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke={String(chartContent.primaryColor || CHART_COLORS[0])} strokeWidth={3} dot />
          </LineChart>
        );
      }

      if (chartType === 'area') {
        return (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke={String(chartContent.primaryColor || CHART_COLORS[0])} fill={String(chartContent.primaryColor || CHART_COLORS[0])} fillOpacity={0.22} />
          </AreaChart>
        );
      }

      if (chartType === 'pie') {
        return (
          <PieChart>
            <Tooltip />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={chartContent.donut ? '45%' : 0} outerRadius="78%" paddingAngle={2}>
              {data.map((_, index) => (
                <Cell key={`chart-cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        );
      }

      if (chartType === 'scatter') {
        return (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" type="category" />
            <YAxis dataKey="value" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={data} fill={String(chartContent.primaryColor || CHART_COLORS[0])} />
          </ScatterChart>
        );
      }

      if (chartType === 'radar') {
        return (
          <RadarChart data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="name" />
            <PolarRadiusAxis />
            <Tooltip />
            <Radar dataKey="value" stroke={String(chartContent.primaryColor || CHART_COLORS[0])} fill={String(chartContent.primaryColor || CHART_COLORS[0])} fillOpacity={0.35} />
          </RadarChart>
        );
      }

      return (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" radius={[8, 8, 2, 2]} fill={String(chartContent.primaryColor || CHART_COLORS[0])} />
        </BarChart>
      );
    };

    return (
      <div className="grid h-full grid-rows-[auto_auto_1fr_auto] gap-2 overflow-hidden">
        <input
          className="w-full border-0 bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
          value={chartContent.title || ''}
          onChange={event => updateCardContent(card.id, { ...chartContent, title: event.target.value })}
          placeholder="Chart title"
        />
        <div className="flex gap-1">
          <select
            className={cn(miniInputClass, 'flex-1 capitalize')}
            value={chartType}
            onChange={event => updateCardContent(card.id, { ...chartContent, chartType: event.target.value })}
            aria-label="Chart type"
          >
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="pie">Pie</option>
            <option value="scatter">Scatter</option>
            <option value="radar">Radar</option>
          </select>
          <input
            className="h-7 w-10 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            type="color"
            value={String(chartContent.primaryColor || CHART_COLORS[0])}
            onChange={event => updateCardContent(card.id, { ...chartContent, primaryColor: event.target.value })}
            aria-label="Chart color"
          />
        </div>
        <div className="min-h-0 overflow-hidden rounded-2xl bg-slate-50 p-2" aria-label="Chart preview">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 overflow-hidden">
          {data.map((entry, index) => (
            <div key={`chart-row-${index}`} className="flex gap-1">
              <input
                className="h-7 w-16 rounded-lg border border-slate-200 bg-white/80 px-2 text-xs text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200/60"
                value={entry.name}
                onChange={event => updateDatum(index, { name: event.target.value })}
                aria-label={`Chart label ${index + 1}`}
              />
              <input
                className="h-7 w-14 rounded-lg border border-slate-200 bg-white/80 px-2 text-xs text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200/60"
                type="number"
                value={entry.value}
                onChange={event => updateDatum(index, { value: safeNumber(event.target.value, 0) })}
                aria-label={`Chart value ${index + 1}`}
              />
            </div>
          ))}
          <button type="button" className={smallTextButtonClass} onClick={() => setData([...data, { name: `Item ${data.length + 1}`, value: 0 }])}>
            <FiPlus className="h-3 w-3" /> Data
          </button>
          {data.length > 1 && (
            <button type="button" className={smallTextButtonClass} onClick={() => setData(data.slice(0, -1))}>
              Remove
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderTableCard = () => {
    const tableContent =
      typeof card.content === 'object' && card.content
        ? card.content
        : {
            view: 'grid',
            columns: ['Item', 'Owner', 'Status'],
            rows: [['Task', 'Ari', 'Doing']],
          };

    const columns = Array.isArray(tableContent.columns) && tableContent.columns.length ? tableContent.columns.map((column: unknown) => String(column)) : ['Item', 'Owner', 'Status'];
    const rows = Array.isArray(tableContent.rows) && tableContent.rows.length ? tableContent.rows.map((row: unknown) => (Array.isArray(row) ? row.map(cell => String(cell)) : [])) : [['', '', '']];
    const view = tableContent.view || 'grid';

    const updateTable = (next: { columns?: string[]; rows?: string[][]; view?: 'grid' | 'kanban' | 'timeline' }) => {
      updateCardContent(card.id, { ...tableContent, columns, rows, ...next });
    };

    const setView = (nextView: 'grid' | 'kanban' | 'timeline') => {
      updateTable({ view: nextView });
    };

    const updateColumn = (columnIndex: number, value: string) => {
      updateTable({ columns: columns.map((column: string, index: number) => (index === columnIndex ? value : column)) });
    };

    const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
      updateTable({
        rows: rows.map((row: string[], index: number) => {
          if (index !== rowIndex) return row;
          const nextRow = [...row];
          nextRow[columnIndex] = value;
          return nextRow;
        }),
      });
    };

    const addRow = () => updateTable({ rows: [...rows, columns.map(() => '')] });
    const removeRow = () => updateTable({ rows: rows.length > 1 ? rows.slice(0, -1) : rows });
    const addColumn = () => updateTable({ columns: [...columns, `Column ${columns.length + 1}`], rows: rows.map((row: string[]) => [...row, '']) });
    const removeColumn = () => {
      if (columns.length <= 1) return;
      updateTable({ columns: columns.slice(0, -1), rows: rows.map((row: string[]) => row.slice(0, -1)) });
    };

    return (
      <div className="grid h-full grid-rows-[auto_1fr_auto] gap-2 overflow-hidden">
        <div className="flex shrink-0 gap-1 overflow-hidden">
          {(['grid', 'kanban', 'timeline'] as const).map(nextView => (
            <button
              key={nextView}
              type="button"
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition',
                view === nextView
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white/80 text-slate-600 hover:border-blue-300 hover:bg-blue-50',
              )}
              onClick={() => setView(nextView)}
            >
              {nextView}
            </button>
          ))}
        </div>
        <div className="overflow-auto rounded-2xl">{view === 'kanban' ? renderKanban(rows) : view === 'timeline' ? renderTimeline(rows) : renderGrid(columns, rows, updateColumn, updateCell)}</div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <button type="button" className={smallTextButtonClass} onClick={addRow}>
            <FiPlus className="h-3 w-3" /> Row
          </button>
          <button type="button" className={smallTextButtonClass} onClick={addColumn}>
            <FiPlus className="h-3 w-3" /> Column
          </button>
          <button type="button" className={smallTextButtonClass} onClick={removeRow}>Remove row</button>
          <button type="button" className={smallTextButtonClass} onClick={removeColumn}>Remove column</button>
        </div>
      </div>
    );
  };

  const renderGrid = (
    columns: string[],
    rows: string[][],
    updateColumn: (columnIndex: number, value: string) => void,
    updateCell: (rowIndex: number, columnIndex: number, value: string) => void,
  ) => (
    <table className="w-full min-w-[360px] table-fixed overflow-hidden rounded-2xl border-collapse text-left text-xs text-slate-700">
      <thead>
        <tr>
          {columns.map((column, columnIndex) => (
            <th key={`column-${columnIndex}`} className="border border-slate-200 bg-slate-50 p-1 font-semibold text-slate-600">
              <input
                className="w-full min-w-0 border-0 bg-transparent px-1 py-1 text-xs font-semibold text-slate-600 outline-none focus:bg-white"
                value={column}
                onChange={event => updateColumn(columnIndex, event.target.value)}
                aria-label={`Column ${columnIndex + 1}`}
              />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`row-${rowIndex}`}>
            {columns.map((column, columnIndex) => (
              <td key={`${column}-${columnIndex}`} className="border border-slate-200 bg-white/70 p-1">
                <input
                  className="w-full min-w-0 border-0 bg-transparent px-1 py-1 text-xs text-slate-700 outline-none focus:bg-blue-50"
                  value={row[columnIndex] || ''}
                  onChange={event => updateCell(rowIndex, columnIndex, event.target.value)}
                  aria-label={`Row ${rowIndex + 1} ${column}`}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderKanban = (rows: string[][]) => {
    const statuses = Array.from(new Set(['Doing', 'Review', 'Done', ...rows.map(row => String(row[2] || '')).filter(Boolean)]));

    return (
      <div className="grid h-full min-w-[420px] grid-cols-3 gap-2 overflow-hidden">
        {statuses.slice(0, 3).map(status => (
          <div key={status} className="overflow-hidden rounded-2xl bg-slate-50 p-2">
            <strong className="mb-2 block truncate text-xs text-slate-500">{status}</strong>
            {rows
              .filter(row => String(row[2] || '').toLowerCase() === status.toLowerCase())
              .map((row, index) => (
                <div key={`${status}-${row[0]}-${index}`} className="mb-2 rounded-xl bg-white p-2 text-xs text-slate-700 shadow-sm">
                  <span className="block truncate font-medium">{row[0]}</span>
                  <small className="block truncate text-slate-500">{row[1]}</small>
                </div>
              ))}
          </div>
        ))}
      </div>
    );
  };

  const renderTimeline = (rows: string[][]) => (
    <div className="grid gap-2 overflow-hidden text-xs text-slate-700">
      {rows.map((row, index) => (
        <div key={`${row[0]}-${index}`} className="grid grid-cols-[64px_1fr] items-center gap-2 overflow-hidden">
          <strong className="truncate text-slate-500">Week {index + 1}</strong>
          <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-slate-50 px-2 py-2">
            <FiCalendar className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span className="truncate">{row[0]}</span>
          </div>
        </div>
      ))}
    </div>
  );

  const renderShapeCard = () => {
    const shapeContent = typeof card.content === 'object' && card.content ? card.content : { label: 'Shape', shape: 'pill' };
    const shape = shapeContent.shape || 'pill';
    const shapeClass =
      shape === 'circle'
        ? 'aspect-square rounded-full'
        : shape === 'diamond'
          ? 'aspect-square rotate-45 rounded-2xl'
          : shape === 'rectangle'
            ? 'rounded-2xl'
            : 'rounded-full';

    return (
      <div className="grid h-full grid-rows-[1fr_auto] place-items-center gap-2 overflow-hidden text-center">
        <div
          className={cn('grid min-h-[74px] w-[82%] max-w-[220px] place-items-center px-5 shadow-inner', shapeClass)}
          style={{ backgroundColor: shapeContent.fill || '#dbeafe', color: shapeContent.textColor || '#1e3a8a' }}
        >
          <input
            className={cn('w-full border-0 bg-transparent text-center text-sm font-extrabold outline-none placeholder:text-blue-300', shape === 'diamond' && '-rotate-45')}
            value={shapeContent.label || ''}
            onChange={event => updateCardContent(card.id, { ...shapeContent, label: event.target.value })}
            aria-label="Shape label"
          />
        </div>
        <div className="flex w-full gap-1">
          <select
            className={cn(miniInputClass, 'flex-1 capitalize')}
            value={shape}
            onChange={event => updateCardContent(card.id, { ...shapeContent, shape: event.target.value })}
            aria-label="Shape style"
          >
            <option value="pill">Pill</option>
            <option value="rectangle">Rectangle</option>
            <option value="circle">Circle</option>
            <option value="diamond">Diamond</option>
          </select>
          <input
            className="h-7 w-10 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            type="color"
            value={shapeContent.fill || '#dbeafe'}
            onChange={event => updateCardContent(card.id, { ...shapeContent, fill: event.target.value })}
            aria-label="Shape fill color"
          />
          <input
            className="h-7 w-10 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            type="color"
            value={shapeContent.textColor || '#1e3a8a'}
            onChange={event => updateCardContent(card.id, { ...shapeContent, textColor: event.target.value })}
            aria-label="Shape text color"
          />
        </div>
      </div>
    );
  };

  const renderDiagramCard = () => {
    const diagramContent = typeof card.content === 'object' && card.content ? card.content : { title: 'Flow', steps: [] };
    const steps = Array.isArray(diagramContent.steps) && diagramContent.steps.length ? diagramContent.steps.map((step: unknown) => String(step)) : ['Start', 'Step', 'Done'];
    const direction = diagramContent.direction || 'horizontal';

    const setSteps = (nextSteps: string[]) => updateCardContent(card.id, { ...diagramContent, steps: nextSteps.length ? nextSteps : [''] });

    return (
      <div className="grid h-full grid-rows-[auto_auto_1fr_auto] place-items-center gap-2 overflow-hidden text-center">
        <input
          className="w-full border-0 bg-transparent text-center text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
          value={diagramContent.title || ''}
          onChange={event => updateCardContent(card.id, { ...diagramContent, title: event.target.value })}
          placeholder="Diagram title"
          aria-label="Diagram title"
        />
        <select
          className={cn(miniInputClass, 'w-full')}
          value={direction}
          onChange={event => updateCardContent(card.id, { ...diagramContent, direction: event.target.value })}
          aria-label="Diagram direction"
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
        <div className={cn('min-h-0 overflow-auto', direction === 'vertical' ? 'grid gap-2' : 'flex flex-wrap items-center justify-center gap-2')}>
          {steps.map((step: string, index: number) => (
            <React.Fragment key={`diagram-step-${index}`}>
              <input
                className="w-24 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-center text-xs font-bold text-indigo-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200/70 w-20 truncate"
                value={step}
                onChange={event => setSteps(steps.map((entry: string, stepIndex: number) => (stepIndex === index ? event.target.value : entry)))}
                aria-label={`Diagram step ${index + 1}`}
              />
              {index < steps.length - 1 && <FiArrowRight className={cn('h-4 w-4 text-slate-400', direction === 'vertical' && 'mx-auto rotate-90')} aria-hidden="true" />}
            </React.Fragment>
          ))}
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className={smallTextButtonClass} onClick={() => setSteps([...steps, `Step ${steps.length + 1}`])}>
            <FiPlus className="h-3 w-3" /> Step
          </button>
          {steps.length > 1 && <button type="button" className={smallTextButtonClass} onClick={() => setSteps(steps.slice(0, -1))}>Remove</button>}
        </div>
      </div>
    );
  };

  const meta = CARD_META[card.type] || { label: card.type, icon: FiSquare };
  const Icon = meta.icon;
  const cardBackground = String(objectContent.backgroundColor || card.color || '#ffffff');

  return (
    <div
      className={cn(
        'board-card absolute z-30 overflow-hidden rounded-2xl border border-slate-200/90 text-slate-950 shadow-2xl shadow-slate-900/10 select-none touch-none',
        isSelected && 'border-blue-500 ring-4 ring-blue-500/15',
        isConnectingFrom && 'border-violet-500 ring-4 ring-violet-500/20',
      )}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height,
        backgroundColor: cardBackground,
        transform: `rotate(${safeNumber(card.rotation, 0)}deg)`,
        transformOrigin: 'center center',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {showChrome && (
        <div className="flex h-11 cursor-grab items-center justify-between gap-2 border-b border-slate-200/70 bg-white/60 px-3 active:cursor-grabbing">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-slate-900/5 text-slate-700">
              <Icon className="h-4 w-4" />
            </span>
            <span className="truncate text-xs font-bold uppercase tracking-wide text-slate-700">{meta.label}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" className={smallButtonClass} onClick={handleConnectorClick} title="Connect card" aria-label="Connect card">
              <FiLink2 className="h-4 w-4" />
            </button>
            <button type="button" className={smallButtonClass} onClick={() => deleteCard(card.id)} title="Delete card" aria-label="Delete card">
              <FiTrash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className={cn('absolute inset-x-0 bottom-0 overflow-hidden p-3', showChrome ? 'top-11' : 'top-0')}>{renderBody()}</div>

      <div
        className="absolute bottom-0 right-0 z-40 grid h-6 w-6 cursor-nwse-resize place-items-center rounded-tl-xl bg-white/70 text-slate-400 hover:text-blue-600"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        aria-hidden="true"
      >
        <FiMaximize2 className="h-3 w-3 rotate-90" />
      </div>
    </div>
  );
};

export default BoardCard;
