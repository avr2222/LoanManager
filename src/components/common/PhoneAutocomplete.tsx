import { useState, useRef, useEffect } from 'react';
import type { Contact } from '@/services/contactsService';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (contact: Contact) => void;
  contacts: Contact[];
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

export function PhoneAutocomplete({ value, onChange, onSelect, contacts, placeholder, readOnly, className }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim().length >= 2
    ? contacts.filter(
        (c) =>
          c.phone.includes(value.replace(/\D/g, '')) ||
          c.name.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 8)
    : [];

  useEffect(() => {
    setHighlighted(0);
  }, [filtered.length]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      onSelect(filtered[highlighted]);
      setOpen(false);
    }
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="tel"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? '10-digit number'}
        readOnly={readOnly}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {filtered.map((c, i) => (
            <li
              key={c.id}
              className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer ${i === highlighted ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(e) => { e.preventDefault(); onSelect(c); setOpen(false); }}
            >
              <span className="font-medium text-slate-800">{c.name}</span>
              <span className="text-slate-400 ml-2">{c.phone}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
