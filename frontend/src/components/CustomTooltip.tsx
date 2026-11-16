import React from 'react';

export interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string | number;
  labelPrefix?: string;
  labelSuffix?: string;
  unit?: string;
  valueFormatter?: (val: number, name: string) => string;
}

export const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
  labelPrefix = '',
  labelSuffix = '',
  unit = '',
  valueFormatter
}) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-slate-900/95 backdrop-blur-md text-white text-xs rounded-xl p-3 border border-slate-800 shadow-xl min-w-[140px] z-50">
      {label !== undefined && (
        <div className="text-[11px] font-mono text-slate-400 border-b border-slate-800 pb-1.5 mb-2 font-medium">
          {labelPrefix}{label}{labelSuffix}
        </div>
      )}
      <div className="space-y-1.5">
        {payload.map((entry, index) => {
          const rawVal = typeof entry.value === 'number' ? entry.value : entry.value;
          let displayVal = rawVal;
          if (valueFormatter) {
            displayVal = valueFormatter(rawVal, entry.name);
          } else if (unit) {
            displayVal = `${rawVal} ${unit}`;
          }
          return (
            <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-[11px]">
              <div className="flex items-center gap-1.5 truncate">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color || entry.fill || '#3B82F6' }}
                />
                <span className="text-slate-300 truncate max-w-[120px]">{entry.name}</span>
              </div>
              <span className="font-mono font-bold text-white shrink-0">
                {displayVal}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
