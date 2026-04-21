import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { profilesService, type Profile } from '@/services/profilesService';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  needsPasswordReset: boolean;
  isAdmin: boolean;
  isMediator: boolean;
  isBorrower: boolean;
  userPhone: string; // phone number of mediator/borrower
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithPhone: (phone: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  updateProfile:  (name: string, phone?: string) => Promise<{ error: string | null }>;
  displayName: string;
  adminPhone: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                     = useState<User | null>(null);
  const [session, setSession]               = useState<Session | null>(null);
  const [profile, setProfile]               = useState<Profile | null>(null);
  const [loading, setLoading]               = useState(true);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);

  async function loadProfile(u: User | null) {
    if (!u) { setProfile(null); return; }
    const p = await profilesService.getProfile(u.id);
    setProfile(p);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null).finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setNeedsPasswordReset(true);
      loadProfile(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  // Phone login — single account per phone number
  // Auto-provisions account on first login if it doesn't exist yet
  const signInWithPhone = useCallback(async (phone: string, _password: string) => {
    const cleaned = phone.replace(/\D/g, '').slice(-10);
    if (cleaned.length < 10) return { error: 'Enter a valid 10-digit phone number' };

    const email    = `${cleaned}@user.local`;
    const password = cleaned; // password is always the phone number

    // First attempt
    const { error: e1 } = await supabase.auth.signInWithPassword({ email, password });
    if (!e1) return { error: null };

    // Account may not exist yet — try to create it
    await supabase.auth.signUp({ email, password });

    // Second attempt after signup
    const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
    if (!e2) return { error: null };

    // Email confirmation is enabled in Supabase — guide the user
    if (e2.message?.toLowerCase().includes('email not confirmed')) {
      return { error: 'Login blocked by email confirmation. Go to Supabase → Auth → Settings and disable "Enable email confirmations".' };
    }

    return { error: 'Phone number not found. Make sure loans are imported with this phone number.' };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    setNeedsPasswordReset(false);
    return { error: null };
  }, []);

  const updateProfile = useCallback(async (name: string, phone?: string) => {
    const meta: Record<string, string> = { full_name: name.trim() };
    if (phone !== undefined) meta.admin_phone = phone.replace(/\D/g, '').slice(-10);
    const { error, data } = await supabase.auth.updateUser({ data: meta });
    if (error) return { error: error.message };
    setUser(data.user);
    return { error: null };
  }, []);

  // Phone users (borrowers/mediators/both) use phone@user.local
  const isPhoneUser = user?.email?.endsWith('@user.local') ?? false;
  const isAdmin     = !!user && !isPhoneUser;
  const isMediator  = isPhoneUser; // kept for compat
  const isBorrower  = isPhoneUser; // kept for compat

  const userPhone   = isPhoneUser ? (user?.email?.split('@')[0] ?? '') : '';
  const adminPhone  = isAdmin ? ((user?.user_metadata?.admin_phone as string | undefined) ?? '') : '';
  const displayName = (user?.user_metadata?.full_name as string | undefined)
    || (isPhoneUser ? userPhone : (user?.email ?? ''));

  return (
    <AuthContext.Provider value={{
      user, session, profile, loading, needsPasswordReset,
      isAdmin, isMediator, isBorrower, userPhone, adminPhone, displayName,
      signIn, signInWithPhone, signOut, updatePassword, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
