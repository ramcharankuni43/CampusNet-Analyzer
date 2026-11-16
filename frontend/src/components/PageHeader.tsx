import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  subtitle,
  icon: Icon,
  badge,
  actions,
  className = ''
}) => {
  const desc = description || subtitle;
  return (
    <div className={`bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-wrap items-center justify-between gap-4 ${className}`}>
      <div className="flex items-start gap-3.5">
        {Icon && (
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm shadow-blue-500/20 shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              {title}
            </h1>
            {badge}
          </div>
          {desc && (
            <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
              {desc}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
