import React, { useRef } from 'react';
import { FiBox, FiLink2, FiMaximize2, FiTrash2 } from 'react-icons/fi';
import type { Card, Tool } from '../../pages/BoardPage';

interface FrameProps {
  card: Card;
  cards: Card[];
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

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const isInteractiveElement = (target: EventTarget) => {
  return Boolean((target as HTMLElement).closest('button, textarea, input, select, label, a'));
};

const smallButtonClass = 'grid h-7 w-7 place-items-center rounded-xl border border-blue-200/70 bg-white/80 text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700';

const safeNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const Frame: React.FC<FrameProps> = ({
  card,
  cards,
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
  const frameContent = typeof card.content === 'object' && card.content ? card.content : { title: String(card.content || 'Frame') };
  const showChrome = frameContent.showChrome !== false;
  const childCount = cards.filter(child => child.parentId === card.id).length;

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

  return (
    <div
      className={cn(
        'board-frame absolute z-10 overflow-hidden rounded-[28px] border-2 border-blue-300/60 bg-white/35 text-slate-950 shadow-2xl shadow-slate-900/10 ring-1 ring-white/60 backdrop-blur-[1px] select-none touch-none',
        isSelected && 'border-blue-500 ring-4 ring-blue-500/15',
        isConnectingFrom && 'border-violet-500 ring-4 ring-violet-500/20',
      )}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height,
        backgroundColor: frameContent.backgroundColor || card.color || 'rgba(255,255,255,0.35)',
        borderColor: frameContent.borderColor || '#93c5fd',
        transform: `rotate(${safeNumber(card.rotation, 0)}deg)`,
        transformOrigin: 'center center',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {showChrome && (
      <div className="flex h-12 cursor-grab items-center justify-between gap-2 border-b border-blue-200/60 bg-white/55 px-4 active:cursor-grabbing">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <FiBox className="h-4 w-4" />
          </span>
          <span className="truncate text-xs font-bold uppercase tracking-wide text-blue-800">Frame</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className={smallButtonClass} onClick={handleConnectorClick} title="Connect frame" aria-label="Connect frame">
            <FiLink2 className="h-4 w-4" />
          </button>
          <button type="button" className={smallButtonClass} onClick={() => deleteCard(card.id)} title="Delete frame and child cards" aria-label="Delete frame and child cards">
            <FiTrash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      )}

      {!frameContent.collapsed && (
      <div className={cn('absolute inset-x-0 bottom-0 grid content-start gap-3 overflow-hidden p-5', showChrome ? 'top-12' : 'top-0')}>
        <input
          className="w-full border-0 bg-transparent text-3xl font-extrabold tracking-tight text-slate-800 outline-none placeholder:text-slate-400"
          value={frameContent.title || ''}
          onChange={event => updateCardContent(card.id, { ...frameContent, title: event.target.value })}
          placeholder="Frame title"
        />
        <div className="truncate text-sm text-slate-500">{frameContent.subtitle || 'Drag cards inside this frame to group them.'}</div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-200/70">
          {childCount} card{childCount === 1 ? '' : 's'} inside
        </div>
      </div>
      )}

      <div
        className="absolute bottom-0 right-0 z-40 grid h-7 w-7 cursor-nwse-resize place-items-center rounded-tl-2xl bg-white/75 text-blue-400 hover:text-blue-700"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        aria-hidden="true"
      >
        <FiMaximize2 className="h-3.5 w-3.5 rotate-90" />
      </div>
    </div>
  );
};

export default Frame;
