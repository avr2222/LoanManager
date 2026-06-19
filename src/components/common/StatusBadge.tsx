interface StatusBadgeProps {
  status: string;
  label?: string;
}

const statusStyles: Record<string, string> = {
  Active:       'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Closed:       'bg-slate-100 text-slate-500 ring-slate-200',
  Defaulted:    'bg-red-50 text-red-600 ring-red-200',
  Restructured: 'bg-amber-50 text-amber-600 ring-amber-200',
  Received:     'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Pending:      'bg-orange-50 text-orange-600 ring-orange-200',
  Waived:       'bg-slate-100 text-slate-500 ring-slate-200',
  Partial:      'bg-blue-50 text-blue-600 ring-blue-200',
  Claimed:      'bg-violet-50 text-violet-700 ring-violet-200',
};

const dotStyles: Record<string, string> = {
  Active:       'bg-emerald-500',
  Closed:       'bg-slate-400',
  Defaulted:    'bg-red-500',
  Restructured: 'bg-amber-500',
  Received:     'bg-emerald-500',
  Pending:      'bg-orange-500',
  Waived:       'bg-slate-400',
  Partial:      'bg-blue-500',
  Claimed:      'bg-violet-500',
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = statusStyles[status] ?? 'bg-slate-100 text-slate-500 ring-slate-200';
  const dot = dotStyles[status] ?? 'bg-slate-400';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset ${style}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label ?? status}
    </span>
  );
}
