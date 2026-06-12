import { supabase } from '@/lib/supabase';

// Module-level cache — avoids re-fetching every time LoanForm mounts.
// Invalidated after writes and after 60 s.
let _cache: Contact[] | null = null;
let _cacheTime = 0;
let _pending: Promise<Contact[]> | null = null;
const CACHE_TTL_MS = 60_000;

function invalidateCache() {
  _cache = null;
  _cacheTime = 0;
  _pending = null;
}

export interface Contact {
  id: string;
  ownerId: string;
  name: string;
  phone: string;
  notes: string;
  createdAt: string;
}

function fromDb(row: Record<string, unknown>): Contact {
  return {
    id:        row.id as string,
    ownerId:   row.owner_id as string,
    name:      (row.name as string) ?? '',
    phone:     (row.phone as string) ?? '',
    notes:     (row.notes as string) ?? '',
    createdAt: row.created_at as string,
  };
}

export const contactsService = {
  async list(): Promise<Contact[]> {
    if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;
    // Dedupe concurrent callers onto one in-flight request
    if (_pending) return _pending;
    _pending = (async () => {
      try {
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .order('name');
        if (error) return _cache ?? [];
        const result = (data as Record<string, unknown>[]).map(fromDb);
        _cache = result;
        _cacheTime = Date.now();
        return result;
      } finally {
        _pending = null;
      }
    })();
    return _pending;
  },

  async upsert(name: string, phone: string, notes?: string): Promise<{ error: string | null }> {
    const normPhone = phone.replace(/\D/g, '').slice(-10);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const { error } = await supabase
      .from('contacts')
      .upsert(
        { owner_id: user.id, name, phone: normPhone, notes: notes ?? '' },
        { onConflict: 'owner_id,phone' }
      );
    if (error) return { error: error.message };
    invalidateCache();
    return { error: null };
  },

  async delete(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) return { error: error.message };
    invalidateCache();
    return { error: null };
  },

  search(contacts: Contact[], query: string): Contact[] {
    const q = query.toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  },
};
