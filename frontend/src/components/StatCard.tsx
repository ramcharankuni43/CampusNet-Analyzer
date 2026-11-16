import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    positive?: boolean;
    neutral?: boolean;
  };
  accentColor?: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'purple' | 'slate';
  color?: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'purple' | 'slate';
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  icon: Icon,
  trend,
  accentColor = 'blue',
  color,
  onClick,
  className = ''
}) => {
  const chosenColor = color || accentColor;

  const colorMap = {
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-600',
      border: 'border-blue-500/20',
      accent: 'from-blue-500 to-indigo-600',
      glow: 'group-hover:border-blue-300'
    },
    emerald: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
      border: 'border-emerald-500/20',
      accent: 'from-emerald-500 to-teal-600',
      glow: 'group-hover:border-emerald-300'
    },
    amber: {
      bg: 'bg-amber-50',
      text: 'text-amber-600',
      border: 'border-amber-500/20',
      accent: 'from-amber-500 to-orange-600',
      glow: 'group-hover:border-amber-300'
    },
    rose: {
      bg: 'bg-rose-50',
      text: 'text-rose-600',
      border: 'border-rose-500/20',
      accent: 'from-rose-500 to-red-600',
      glow: 'group-hover:border-rose-300'
    },
    indigo: {
      bg: 'bg-indigo-50',
      text: 'text-indigo-600',
      border: 'border-indigo-500/20',
      accent: 'from-indigo-500 to-purple-600',
      glow: 'group-hover:border-indigo-300'
    },
    purple: {
      bg: 'bg-purple-50',
      text: 'text-purple-600',
      border: 'border-purple-500/20',
      accent: 'from-purple-500 to-pink-600',
      glow: 'group-hover:border-purple-300'
    },
    slate: {
      bg: 'bg-slate-50',
      text: 'text-slate-600',
      border: 'border-slate-500/20',
      accent: 'from-slate-500 to-slate-700',
      glow: 'group-hover:border-slate-300'
    }
  };

  const scheme = colorMap[chosenColor] || colorMap.blue;

  return (
    <div
      onClick={onClick}
      className={`group relative bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${scheme.glow} ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 tracking-tight">
          {title}
        </span>
        <div className={`p-2 rounded-xl ${scheme.bg} ${scheme.text} ring-1 ring-inset ${scheme.border} transition-transform group-hover:scale-105`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
          {value}
        </span>
        {unit && (
          <span className={`text-xs font-bold ${scheme.text}`}>
            {unit}
          </span>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
          {subtitle && <span className="truncate">{subtitle}</span>}
          {trend && (
            <span
              className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                trend.positive
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : trend.neutral
                  ? 'bg-slate-50 text-slate-600 border border-slate-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {trend.value}
            </span>
          )}
        </div>
      )}

      {/* Decorative gradient bottom bar */}
      <div className={`absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r ${scheme.accent} rounded-full opacity-0 group-hover:opacity-100 transition-opacity`} />
    </div>
  );
};
