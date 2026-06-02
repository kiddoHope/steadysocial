import React from 'react';

const ScaleLabel: React.FC<{ scale: number; focusMode?: boolean }> = ({ scale, focusMode = false }) => {
  return (
    <span
      className={[
        'inline-flex h-9 min-w-[64px] items-center justify-center rounded-xl border px-3 text-sm font-bold',
        focusMode ? 'border-white/10 bg-slate-800/80 text-slate-300' : 'border-slate-200 bg-white/85 text-slate-500',
      ].join(' ')}
      aria-label={`Zoom ${Math.round(scale * 100)} percent`}
    >
      {Math.round(scale * 100)}%
    </span>
  );
};

export default ScaleLabel;
