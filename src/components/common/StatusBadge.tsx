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
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = statusStyles[status] ?? 'bg-slate-100 text-slate-500 ring-slate-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset ${style}`}>
      {label ?? status}
    </span>
  );
}
