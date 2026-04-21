import { supabase } from '@/lib/supabase';
import type { Loan } from '@/types';

export interface Profile {
  id: string;
  role: 'admin' | 'mediator' | 'borrower';
  phone: string;
}

export const profilesService = {
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data as Profile;
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
      // signUp is idempotent — silently ignores "already registered"
      await supabase.auth.signUp({ email: `${phone}@user.local`, password: phone });
    }
  },

  async listByRole(role: 'mediator' | 'borrower'): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', role);
    if (error) return [];
    return data as Profile[];
  },
};
