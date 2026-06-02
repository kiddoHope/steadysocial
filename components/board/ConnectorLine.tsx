import React from 'react';
import type { Card, Connector } from '../../pages/BoardPage';

interface ConnectorLineProps {
  connector: Connector;
  cards: Card[];
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

type Point = { x: number; y: number };

function getEdgePoint(card: Card, other: Card): Point {
  const cx = card.x + card.width / 2;
  const cy = card.y + card.height / 2;
  const ox = other.x + other.width / 2;
  const oy = other.y + other.height / 2;
  const dx = ox - cx;
  const dy = oy - cy;

  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      x: cx + Math.sign(dx || 1) * (card.width / 2),
      y: cy,
    };
  }

  return {
    x: cx,
    y: cy + Math.sign(dy || 1) * (card.height / 2),
  };
}

function connectorPath(start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const tension = Math.min(180, Math.max(70, (horizontal ? Math.abs(dx) : Math.abs(dy)) * 0.45));

  if (horizontal) {
    const direction = Math.sign(dx || 1);
    return `M ${start.x} ${start.y} C ${start.x + tension * direction} ${start.y}, ${end.x - tension * direction} ${end.y}, ${end.x} ${end.y}`;
  }

  const direction = Math.sign(dy || 1);
  return `M ${start.x} ${start.y} C ${start.x} ${start.y + tension * direction}, ${end.x} ${end.y - tension * direction}, ${end.x} ${end.y}`;
}

const ConnectorLine: React.FC<ConnectorLineProps> = ({ connector, cards, isSelected, onSelect, onDelete }) => {
  const fromCard = cards.find(card => card.id === connector.from);
  const toCard = cards.find(card => card.id === connector.to);

  if (!fromCard || !toCard) return null;

  const start = getEdgePoint(fromCard, toCard);
  const end = getEdgePoint(toCard, fromCard);
  const path = connectorPath(start, end);
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const stroke = connector.color || '#64748b';
  const strokeWidth = connector.strokeWidth || 2.5;

  return (
    <g className="group pointer-events-auto" onClick={() => onSelect(connector.id)} onDoubleClick={() => onDelete(connector.id)}>
      <path d={path} className="fill-none stroke-transparent stroke-[16px] [pointer-events:stroke] cursor-pointer" />
      <path
        d={path}
        className="pointer-events-none fill-none transition"
        stroke={isSelected ? '#2563eb' : stroke}
        strokeWidth={isSelected ? strokeWidth + 1 : strokeWidth}
        strokeDasharray={connector.dashed ? '10 8' : undefined}
        markerEnd="url(#board-arrowhead)"
      />
      {connector.label && (
        <foreignObject x={mid.x - 70} y={mid.y - 18} width={140} height={36} className="pointer-events-none overflow-visible">
          <div className="mx-auto w-fit max-w-[132px] truncate rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-center text-[11px] font-bold text-slate-600 shadow-sm">
            {connector.label}
          </div>
        </foreignObject>
      )}
    </g>
  );
};

export default ConnectorLine;
