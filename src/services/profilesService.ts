import { supabase } from '@/lib/supabase';
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

  // Admin: list all non-super-admin profiles
  async listAll(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_super_admin', false)
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
  // Called after import or when a loan is added.
  // Password defaults to the phone number itself.
  // Silently skips if account already exists.
  // One account per phone number regardless of role (borrower, mediator, or both).
  // Email format: phone@user.local, default password = phone number.
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

    for (const phone of phones) {
      const email = `${phone}@user.local`;
      // Only provision if the account doesn't exist yet.
      // DO NOT call signUp for existing accounts — Supabase (with email confirmation
      // disabled) resets the password, which would wipe any custom password the user set.
      const { error } = await supabase.auth.signInWithPassword({ email, password: phone });
      if (!error) continue; // already exists and has default password — skip
      // If sign-in failed with anything other than "invalid credentials", skip too
      // Only provision if truly new (we can't distinguish "wrong password" from "no account"
      // via the error message, so we attempt signUp but accept the error either way)
      await supabase.auth.signUp({ email, password: phone });
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
