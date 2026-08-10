import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import type { Loan } from '@/types';

export interface Profile {
  id: string;
  role: 'admin' | 'mediator' | 'borrower' | 'user';
  phone: string;
  fullName: string;
  email: string;
  isSuperAdmin: boolean;
  displayName?: string | null;  // kept for backward compat
  isActive: boolean;
  disabledAt?: string | null;
  disabledBy?: string | null;
  upiId: string;
}

function fromDbProfile(row: Record<string, unknown>): Profile {
  return {
    id:          row.id as string,
    role:        (row.role as Profile['role']) ?? 'user',
    phone:       (row.phone as string) ?? '',
    fullName:    (row.full_name as string) ?? (row.display_name as string) ?? '',
    email:       (row.email as string) ?? '',
    isSuperAdmin: row.is_super_admin === true,
    displayName: (row.display_name as string | null) ?? null,
    isActive:    row.is_active !== false,
    disabledAt:  (row.disabled_at as string | null) ?? null,
    disabledBy:  (row.disabled_by as string | null) ?? null,
    upiId:       (row.upi_id as string) ?? '',
  };
}

export const profilesService = {
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) return null;
    return fromDbProfile(data as Record<string, unknown>);
  },

  // Admin: list all profiles (including other super admins)
  async listAll(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true });
    if (error) return [];
    return (data as Record<string, unknown>[]).map(fromDbProfile);
  },

  // Update full name, phone, and/or UPI ID in profiles table
  async updateProfile(userId: string, data: { fullName?: string; phone?: string; upiId?: string }): Promise<{ error: string | null }> {
    const updates: Record<string, unknown> = {};
    if (data.fullName !== undefined) {
      updates.full_name    = data.fullName.trim() || null;
      updates.display_name = data.fullName.trim() || null; // keep in sync
    }
    if (data.phone !== undefined) {
      updates.phone = data.phone.replace(/\D/g, '').slice(-10);
    }
    if (data.upiId !== undefined) {
      updates.upi_id = data.upiId.trim();
    }
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
    if (error) return { error: error.message };
    return { error: null };
  },

  // Phone user: save their chosen display name to profiles table
  async updateDisplayName(userId: string, name: string): Promise<void> {
    await supabase
      .from('profiles')
      .update({ display_name: name.trim() || null, full_name: name.trim() || null })
      .eq('id', userId);
  },

  // Admin: enable or disable a user
  async setActive(userId: string, active: boolean, disabledBy?: string): Promise<{ error: string | null }> {
    const updates: Record<string, unknown> = {
      is_active: active,
      disabled_at: active ? null : new Date().toISOString(),
      disabled_by: active ? null : (disabledBy ?? null),
    };
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);
    if (error) return { error: error.message };
    return { error: null };
  },

  // Auto-provision phone accounts from loan data.
  // Uses a disposable Supabase client (persistSession: false) so signUp/signIn
  // never overwrites the currently logged-in admin's session.
  async provisionFromLoans(loans: Loan[]): Promise<void> {
    const phones = new Set<string>();
    for (const loan of loans) {
      const bp = loan.borrowerPhone?.replace(/\D/g, '').slice(-10);
      if (bp && bp.length >= 10) phones.add(bp);
      if (loan.loanType === 'Through Mediator') {
        const mp = loan.mediatorPhone?.replace(/\D/g, '').slice(-10);
        if (mp && mp.length >= 10) phones.add(mp);
      }
    }
    if (phones.size === 0) return;

    // Check which phones already have profiles — avoids any auth call for existing users
    const { data: existing } = await supabase
      .from('profiles')
      .select('phone')
      .in('phone', [...phones]);
    const existingSet = new Set((existing ?? []).map((r) => (r as { phone: string }).phone));
    const newPhones = [...phones].filter((p) => !existingSet.has(p));
    if (newPhones.length === 0) return;

    // Disposable client — auth calls on this instance never update localStorage
    // or fire onAuthStateChange on the main client, so the admin stays logged in.
    const guest = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    for (const phone of newPhones) {
      await guest.auth.signUp({
        email: `${phone}@user.local`,
        password: phone,
        options: { data: { phone } },
      });
    }
  },

  async listByRole(role: 'mediator' | 'borrower'): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', role);
    if (error) return [];
    return (data as Record<string, unknown>[]).map(fromDbProfile);
  },

  // Fetch UPI ID for a phone number — used by borrowers to pay their lender/mediator.
  // Uses a SECURITY DEFINER RPC so RLS doesn't block cross-user reads.
  async getUpiIdByPhone(phone: string): Promise<string> {
    const cleaned = phone.replace(/\D/g, '').slice(-10);
    if (!cleaned) return '';
    const { data, error } = await supabase.rpc('get_upi_id_by_phone', { p_phone: cleaned });
    if (error || data == null) return '';
    return data as string;
  },
};
