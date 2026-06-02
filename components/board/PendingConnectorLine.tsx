import React from 'react';
import type { Card } from '../../pages/BoardPage';

interface PendingConnectorLineProps {
  from: string;
  mousePos: { x: number; y: number };
  cards: Card[];
}

const PendingConnectorLine: React.FC<PendingConnectorLineProps> = ({ from, mousePos, cards }) => {
  const fromCard = cards.find(card => card.id === from);
  if (!fromCard) return null;

  const start = {
    x: fromCard.x + fromCard.width / 2,
    y: fromCard.y + fromCard.height / 2,
  };

  const dx = mousePos.x - start.x;
  const tension = Math.min(160, Math.max(70, Math.abs(dx) * 0.45));
  const direction = Math.sign(dx || 1);
  const path = `M ${start.x} ${start.y} C ${start.x + tension * direction} ${start.y}, ${mousePos.x - tension * direction} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`;

  return (
    <g className="pointer-events-none">
      <path d={path} className="fill-none stroke-blue-600 stroke-[2.5px] [stroke-dasharray:8_8]" />
      <circle cx={start.x} cy={start.y} r="5" className="fill-blue-600" />
      <circle cx={mousePos.x} cy={mousePos.y} r="4" className="fill-blue-600 opacity-70" />
    </g>
  );
};

export default PendingConnectorLine;
