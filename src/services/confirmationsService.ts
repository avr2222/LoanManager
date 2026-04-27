import { supabase } from '@/lib/supabase';

export type ConfirmationStatus = 'Pending' | 'Confirmed' | 'Disputed';
export type PartyRole = 'lender' | 'borrower' | 'mediator';

export interface PartyConfirmation {
  id: string;
  loanId: string;
  userId: string | null;
  partyRole: PartyRole;
  partyName: string;
  partyPhone: string;
  status: ConfirmationStatus;
  note: string;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function fromDb(row: Record<string, unknown>): PartyConfirmation {
  return {
    id:          row.id as string,
    loanId:      row.loan_id as string,
    userId:      (row.user_id as string | null) ?? null,
    partyRole:   row.party_role as PartyRole,
    partyName:   (row.party_name as string) ?? '',
    partyPhone:  (row.party_phone as string) ?? '',
    status:      (row.status as ConfirmationStatus) ?? 'Pending',
    note:        (row.note as string) ?? '',
    respondedAt: (row.responded_at as string | null) ?? null,
    createdAt:   row.created_at as string,
    updatedAt:   row.updated_at as string,
  };
}

export const confirmationsService = {
  async fetchByLoan(loanId: string): Promise<PartyConfirmation[]> {
    const { data, error } = await supabase
      .from('loan_party_confirmations')
      .select('*')
      .eq('loan_id', loanId)
      .order('party_role');
    if (error) return [];
    return (data as Record<string, unknown>[]).map(fromDb);
  },

  async confirm(confirmationId: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('loan_party_confirmations')
      .update({ status: 'Confirmed', responded_at: new Date().toISOString(), note: '' })
      .eq('id', confirmationId);
    if (error) return { error: error.message };
    return { error: null };
  },

  async dispute(confirmationId: string, note: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('loan_party_confirmations')
      .update({ status: 'Disputed', responded_at: new Date().toISOString(), note })
      .eq('id', confirmationId);
    if (error) return { error: error.message };
    return { error: null };
  },

  // Offline confirm — creator marks an unregistered party as confirmed
  async confirmOffline(confirmationId: string, note: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('loan_party_confirmations')
      .update({ status: 'Confirmed', responded_at: new Date().toISOString(), note })
      .eq('id', confirmationId);
    if (error) return { error: error.message };
    return { error: null };
  },
};
