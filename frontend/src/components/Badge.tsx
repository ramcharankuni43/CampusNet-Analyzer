import React from 'react';

export interface ProtocolBadgeProps {
  protocol: string;
  className?: string;
}

export const ProtocolBadge: React.FC<ProtocolBadgeProps> = ({ protocol, className = '' }) => {
  const isTcp = protocol.toUpperCase().includes('TCP');
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-bold text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider ${
        isTcp
          ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
          : 'bg-amber-50 text-amber-700 border border-amber-200/80'
      } ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isTcp ? 'bg-blue-500' : 'bg-amber-500'}`} />
      {protocol}
    </span>
  );
};

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'success') {
    return (
      <span className={`inline-flex items-center gap-1 font-semibold text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Completed
      </span>
    );
  }
  if (s === 'running' || s === 'in_progress') {
    return (
      <span className={`inline-flex items-center gap-1 font-semibold text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
        Running
      </span>
    );
  }
  if (s === 'failed' || s === 'error') {
    return (
      <span className={`inline-flex items-center gap-1 font-semibold text-[11px] px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Failed
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 font-semibold text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      {status}
    </span>
  );
};

export interface TierBadgeProps {
  tier: string;
  className?: string;
}

export const TierBadge: React.FC<TierBadgeProps> = ({ tier, className = '' }) => {
  const t = tier.toLowerCase();
  let color = 'bg-slate-100 text-slate-700 border-slate-200';
  if (t === 'low') color = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (t === 'medium') color = 'bg-blue-50 text-blue-700 border-blue-200';
  if (t === 'high') color = 'bg-rose-50 text-rose-700 border-rose-200';
  if (t === 'custom') color = 'bg-purple-50 text-purple-700 border-purple-200';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${color} ${className}`}>
      {tier}
    </span>
  );
};
