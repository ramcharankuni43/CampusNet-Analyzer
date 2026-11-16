import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionLink?: string;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionText,
  actionLabel,
  onAction,
  actionLink,
  className = ''
}) => {
  const btnLabel = actionLabel || actionText;

  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center bg-white border border-slate-200/90 rounded-2xl shadow-xs ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mb-4 shadow-2xs">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-sm font-bold text-slate-800 tracking-tight">
        {title}
      </h3>
      <p className="text-xs text-slate-500 mt-1.5 max-w-sm leading-relaxed">
        {description}
      </p>
      {(btnLabel && (onAction || actionLink)) && (
        <div className="mt-5">
          {actionLink ? (
            <a
              href={actionLink}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs shadow-blue-500/20 transition-all hover:scale-[1.02]"
            >
              {btnLabel}
            </a>
          ) : (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs shadow-blue-500/20 transition-all hover:scale-[1.02]"
            >
              {btnLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
