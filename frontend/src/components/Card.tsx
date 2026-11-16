import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface CardProps {
  title?: string;
  subtitle?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  description,
  icon: Icon,
  action,
  actions,
  children,
  className = '',
  bodyClassName = '',
  headerClassName = ''
}) => {
  const headerAction = action || actions;
  const sub = subtitle || description;

  return (
    <div className={`bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden transition-all ${className}`}>
      {(title || headerAction) && (
        <div className={`px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 ${headerClassName}`}>
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-500/20">
                <Icon className="w-4 h-4" />
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  {title}
                </h3>
              )}
              {sub && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {sub}
                </p>
              )}
            </div>
          </div>
          {headerAction && <div className="flex items-center gap-2">{headerAction}</div>}
        </div>
      )}
      <div className={`p-5 ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
};
