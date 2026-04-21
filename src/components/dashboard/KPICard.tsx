interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  accent?: 'default' | 'green' | 'red' | 'amber';
}

const accentMap = {
  default: 'text-slate-900',
  green:   'text-emerald-600',
  red:     'text-red-500',
  amber:   'text-amber-500',
};

export function KPICard({ title, value, subtitle, accent = 'default' }: KPICardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">{title}</p>
      <p className={`text-2xl font-bold leading-none ${accentMap[accent]}`}>{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1.5">{subtitle}</p>}
    </div>
  );
}
