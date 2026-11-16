import React from 'react';

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs animate-pulse space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="w-8 h-8 rounded-xl bg-slate-100" />
          </div>
          <div className="h-7 w-28 bg-slate-200 rounded" />
          <div className="h-2.5 w-36 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
        <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between gap-4 animate-pulse">
            <div className="h-4 w-20 bg-slate-200 rounded" />
            <div className="h-4 w-40 bg-slate-100 rounded" />
            <div className="h-4 w-16 bg-slate-100 rounded" />
            <div className="h-4 w-24 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const LoadingSkeleton: React.FC<{ type?: 'card' | 'table'; count?: number; rows?: number }> = ({
  type = 'card',
  count = 4,
  rows = 5
}) => {
  if (type === 'table') {
    return <TableSkeleton rows={rows} />;
  }
  return <CardSkeleton count={count} />;
};
