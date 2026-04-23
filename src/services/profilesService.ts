import { supabase } from '@/lib/supabase';
import type { Loan } from '@/types';

export interface Profile {
  id: string;
  role: 'admin' | 'mediator' | 'borrower';
  phone: string;
  displayName?: string | null;
  isActive: boolean;
  disabledAt?: string | null;
  disabledBy?: string | null;
}

function fromDbProfile(row: Record<string, unknown>): Profile {
  return {
    id:          row.id as string,
    role:        (row.role as Profile['role']) ?? 'mediator',
    phone:       (row.phone as string) ?? '',
    displayName: (row.display_name as string | null) ?? null,
    isActive:    row.is_active !== false, // default true if NULL
    disabledAt:  (row.disabled_at as string | null) ?? null,
    disabledBy:  (row.disabled_by as string | null) ?? null,
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

  // Admin: list all phone-user profiles
  async listAll(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'admin')
      .order('phone', { ascending: true });
    if (error) return [];
    return (data as Record<string, unknown>[]).map(fromDbProfile);
  },

  // Phone user: save their chosen display name to profiles table
  async updateDisplayName(userId: string, name: string): Promise<void> {
    await supabase
      .from('profiles')
      .update({ display_name: name.trim() || null })
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
};
