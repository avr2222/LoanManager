import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ title, onClose, children, size = 'lg' }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end sm:items-center justify-center sm:p-4">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className={`relative bg-white w-full sm:rounded-2xl shadow-2xl shadow-black/10 border border-slate-200/60 ${sizeClasses[size]} z-10 rounded-t-2xl max-h-[95dvh] flex flex-col`}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors p-1.5 rounded-lg"
            >
              <X size={16} />
            </button>
          </div>
          {/* Scrollable content */}
          <div className="px-5 py-4 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
