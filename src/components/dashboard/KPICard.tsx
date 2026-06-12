interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  accent?: 'default' | 'green' | 'red' | 'amber';
  /** Makes the card clickable (e.g. navigate to a filtered list) */
  onClick?: () => void;
}

const accentMap = {
  default: 'text-slate-900',
  green:   'text-emerald-600',
  red:     'text-red-500',
  amber:   'text-amber-500',
};

export function KPICard({ title, value, subtitle, accent = 'default', onClick }: KPICardProps) {
  const content = (
    <>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">{title}</p>
      <p className={`text-2xl font-bold leading-none ${accentMap[accent]}`}>{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1.5">{subtitle}</p>}
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="text-left w-full bg-white rounded-2xl border border-slate-100 px-5 py-4 cursor-pointer hover:shadow-md hover:border-indigo-200 hover:-translate-y-0.5 transition-all"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4">
      {content}
    </div>
  );
}
