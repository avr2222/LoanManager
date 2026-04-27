import { supabase } from '@/lib/supabase';

export interface Invitation {
  id: string;
  token: string;
  phone: string;
  note: string;
  createdBy: string | null;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

function fromDbInvitation(row: Record<string, unknown>): Invitation {
  return {
    id:        row.id as string,
    token:     row.token as string,
    phone:     (row.phone as string) ?? '',
    note:      (row.note as string) ?? '',
    createdBy: (row.created_by as string | null) ?? null,
    usedBy:    (row.used_by as string | null) ?? null,
    usedAt:    (row.used_at as string | null) ?? null,
    expiresAt: row.expires_at as string,
    createdAt: row.created_at as string,
  };
}

export const invitationsService = {
  // Create a new invitation. phone is optional — if set, only that phone can use it.
  async create(phone: string, note: string): Promise<{ data: Invitation | null; error: string | null }> {
    const { data, error } = await supabase
      .from('invitations')
      .insert({ phone: phone.replace(/\D/g, '').slice(-10), note, created_by: (await supabase.auth.getUser()).data.user?.id })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: fromDbInvitation(data as Record<string, unknown>), error: null };
  },

  // List all invitations created by the current user (or all if super admin)
  async listMine(): Promise<Invitation[]> {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data as Record<string, unknown>[]).map(fromDbInvitation);
  },

  // Revoke an unused invitation
  async revoke(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('invitations')
      .delete()
      .eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
  },

  // Build the shareable registration link for a token
  buildLink(token: string): string {
    const base = window.location.origin + window.location.pathname;
    return `${base}#/register?invite=${token}`;
  },

  status(inv: Invitation): 'used' | 'expired' | 'active' {
    if (inv.usedAt) return 'used';
    if (new Date(inv.expiresAt) < new Date()) return 'expired';
    return 'active';
  },
};
